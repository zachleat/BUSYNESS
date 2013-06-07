var IS_PRODUCTION = process.env.NODE_ENV == 'production';

if( IS_PRODUCTION ) {
	require('nodefly').profile(
		process.env.NODEFLY_ID,
		['twitter-silencer', 'Heroku'],
		{ // time in ms when the event loop is considered blocked
			blockThreshold: 10
		}
	);
}

var express = require( 'express' ),
	http = require( 'http' ),
	path = require( 'path' ),
	config = require( './config.json' ),
	Rsvp = require( './lib/rsvp' ),
	humanize = require('humanize-number'),
	MemcachedStore = require( './lib/connect-memcached' )( express ),
	SESSION_SECRET = process.env.SESSION_SECRET || config.developmentSessionSecret;

config.port = process.env.PORT || config.defaultPort;

if( IS_PRODUCTION ) {
	if( process.env.PORT ) {
		config.domain = config.productionDomain;
	} else {
		config.domain = config.productionDomain + ':' + config.port;
	}
} else {
	config.domain = config.developmentDomain + ':' + config.port;
}

if( process.env.consumerKey && process.env.consumerSecret ) {
	config.consumerKey = process.env.consumerKey;
	config.consumerSecret = process.env.consumerSecret;
} else {
	var twitterConfig = require('./twitter_config.json');
	config.consumerKey = twitterConfig.consumerKey;
	config.consumerSecret = twitterConfig.consumerSecret;
}

config.oauthCallbackCallback = function(req, res, next, screen_name) {
	res.redirect( '/' + screen_name );
};

var twitterAuth = require( 'twitter-oauth' )( config ),
	app = express();

app.configure(function(){
	app.set( 'port', config.port );
	app.set( 'views', __dirname + '/views' );
	app.set( 'view engine', 'ejs' );
	app.use(express.favicon());
	app.use(express.logger( 'dev' ));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.cookieParser( SESSION_SECRET ));

	var MemJS = require( 'memjs' ).Client,
		MemcachedInstance = MemJS.create();

	app.use(express.session({
		secret: SESSION_SECRET,
		store: new MemcachedStore({}, MemcachedInstance)
	}));

	app.use(app.router);
	app.use(express.static(path.join(__dirname, 'public' )));
});

app.configure( 'development', function() {
	app.use( express.errorHandler() );
});

var Silencer = {
	APP_NAME: 'BUSYNESS',
	// This value is probably the biggest tweak we can change for server performance
	MAX_CAP: 600,
	TRUNCATE_PERCENTAGE_TOP: 0.1,
	TRUNCATE_PERCENTAGE_BOTTOM: 0.05,
	MIN_TRUNCATE_TOP: 20,
	MIN_TRUNCATE_BOTTOM: 10,
	CUTOFF_AVG_TO_CRAZY: 40,
	lookupUrl: 'https://api.twitter.com/1.1/users/lookup.json',
	loudnessRating: function( tweetsPerDay ) {
		var $cutoff = Silencer.CUTOFF_AVG_TO_CRAZY;
		if( tweetsPerDay <= $cutoff ) {
			return Math.round( tweetsPerDay );
		}
		return Math.min( Math.round( $cutoff + tweetsPerDay / 10 ), $cutoff + 10 );
	},
	getTextColorFromBackgroundColor: function(hexcolor){ //getContrastYIQ
		var r = parseInt(hexcolor.substr(0,2),16);
		var g = parseInt(hexcolor.substr(2,2),16);
		var b = parseInt(hexcolor.substr(4,2),16);
		var yiq = ((r*299)+(g*587)+(b*114))/1000;
		return (yiq >= 128) ? 'black' : 'white';
	},
	convertTwitterUser: function( user ) {
		var birth = new Date(user.created_at),
			ageInDays = ( ( new Date() - birth ) / ( 1000*60*60*24 ) ).toFixed( 2 ),
			tweetsPerDay = ( user.statuses_count / ageInDays ).toFixed( 2 );

		return {
			username: user.screen_name,
			name: user.name,
			friends: user.friends_count,
			tweets: user.statuses_count,
			followers: user.followers_count,
			listed: user.listed_count,
			favorites: user.favourites_count,
			description: user.description,
			avatar: user.profile_image_url,
			background: '#' + user.profile_background_color +
				( user.profile_use_background_image ? ' url("' + user.profile_background_image_url + '")' + 
					( user.profile_background_tile === true ? ' repeat' : ' no-repeat' ) : '' ),
			// would use this, but too many profiles have bad data: '#' + user.profile_text_color,
			textColor: Silencer.getTextColorFromBackgroundColor( user.profile_background_color ),
			ageInDays: ageInDays,
			ageInYears: ( ageInDays / 365 ).toFixed( 2 ),
			tweetsPerDay: tweetsPerDay,
			loudness: Silencer.loudnessRating( tweetsPerDay )
		};
	},
	middleware: function( req, res, callback ) {
		var token = req.session.oauthAccessToken,
			secret = req.session.oauthAccessTokenSecret,
			username = req.params.username;

		if( !token || !secret || !username ) {
			res.redirect( '/' );
			return;
		}

		callback( token, secret, username );
	}
};

app.get( '/', function( req, res ) {
	if( req.cookies && req.cookies.token && req.cookies.secret && req.cookies.username ) {
		res.redirect( '/' + req.cookies.username );
	} else {
		res.render('index', {
			title: Silencer.APP_NAME,
			login: config.login,
			logout: false
		});
	}
});

function twitterFetchPromise( url, token, secret ) {
	var promise = new Rsvp.Promise();
	twitterAuth.fetch( url, token, secret, function( error, data ) {
		if( error ) {
			promise.reject( error );
		} else {
			promise.resolve( data );
		}
	});
	return promise;
}

app.get( '/:username', function( req, res ) {
	var token,
		secret,
		username = req.params.username,
		setCookies = false,
		cookieOptions = { signed: false, maxAge: 1000*60*60*24*7, httpOnly: true };

	if( req.cookies && req.cookies.token && req.cookies.secret ) {
		token = req.cookies.token;
		secret = req.cookies.secret;
	} else {
		token = req.session.oauthAccessToken;
		secret = req.session.oauthAccessTokenSecret;
		setCookies = true;
	}

	if( !token || !secret || !username ) {
		res.redirect( '/' );
		return;
	}

	if( setCookies ) {
		res.cookie( 'token', token, cookieOptions );
		res.cookie( 'secret', secret, cookieOptions );
		res.cookie( 'username', username, cookieOptions );
	}

	var maxAge = 60*60; // 1 hour
	res.setHeader('Cache-Control', 'public, max-age=' + maxAge);

	function errorCallback( error ) {
		console.log( 'Error callback: ', error );
		res.render('error', {
			title: Silencer.APP_NAME + " Error",
			error: JSON.stringify( error )
		});
	}

	twitterFetchPromise( 'https://api.twitter.com/1.1/friends/ids.json?screen_name=' + username, token, secret ).then(function( data ) {
		if( !data || !data.ids ) {
			res.redirect( '/' );
			return;
		}

		var ids = data.ids.slice( 0, Silencer.MAX_CAP ),
			originUser,
			users = [],
			totalTweetsPerDay = 0,
			mean,
			median,
			promises = [];

		promises.push( twitterFetchPromise( Silencer.lookupUrl + '?screen_name=' + username, token, secret ).then(function( data ) {
				if( data && data.length ) {
					originUser = Silencer.convertTwitterUser( data[ 0 ] );
				}
			}, errorCallback ) );

		for( var j = 0, k = ids.length; j<k; j+= 100 ) {
			promises.push( twitterFetchPromise( Silencer.lookupUrl + '?user_id=' + ids.slice(j, j + 100), token, secret ).then(function( lookupData ) {
					if( lookupData && lookupData.length ) {
						lookupData.forEach(function( user ) {
							var converted = Silencer.convertTwitterUser( user );
							totalTweetsPerDay += +converted.tweetsPerDay;

							users.push( converted );
						});
					}
				}, errorCallback ) );
		}

		Rsvp.all( promises ).then(function() {
			// sort users by tweets per day desc
			users = users.sort(function(a, b) {
				return b.tweetsPerDay - a.tweetsPerDay;
			});

			median = users[ Math.floor( users.length / 2 ) ].tweetsPerDay;
			mean = ( totalTweetsPerDay / users.length ).toFixed( 2 );

			var truncatePercentageTop = Math.floor( users.length * Silencer.TRUNCATE_PERCENTAGE_TOP ),
				truncatePercentageBottom = Math.floor( users.length * Silencer.TRUNCATE_PERCENTAGE_BOTTOM );

			res.render('user', {
				title: Silencer.APP_NAME + ' for ' + originUser.username,
				logout: config.logout,
				originUser: originUser,
				total: Math.round( totalTweetsPerDay ),
				users: users,
				maxCap: Silencer.MAX_CAP,
				truncateTopLength: Math.max( truncatePercentageTop, Silencer.MIN_TRUNCATE_TOP ),
				truncateBottomLength: Math.max( truncatePercentageBottom, Silencer.MIN_TRUNCATE_BOTTOM ),
				mean: mean,
				median: median,
				max: users[ 0 ].tweetsPerDay,
				ellipsisShown: false,
				humanize: humanize
			});
		}, errorCallback );
	}, errorCallback );
});

app.get( config.login, twitterAuth.oauthConnect );
app.get( config.loginCallback, twitterAuth.oauthCallback );
app.get( config.logout, function( req, res ) {
	res.clearCookie( 'secret', {
		path: '/',
		httpOnly: true,
		maxAge: null
	});
	res.clearCookie( 'token', {
		path: '/',
		httpOnly: true,
		maxAge: null
	});
	req.session.oauthAccessToken = null;
	req.session.oauthAccessTokenSecret = null;
	req.session.destroy();
	res.redirect( '/' );
} );

http.createServer( app ).listen( app.get( 'port' ), function(){
	console.log( 'Express server listening on port ' + app.get( 'port' ) );
});