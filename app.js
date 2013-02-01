var express = require( 'express' ),
	http = require( 'http' ),
	path = require( 'path' ),
	config = require( './config.json' ),
	Rsvp = require( 'rsvp' );
	IS_PRODUCTION = process.env.NODE_ENV == 'production';

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
	app.use(express.cookieParser( 'rhino_spidermonkey_bowling_chimpanzee' ));
// app.use(express.session({ secret: 'rhino_spidermonkey_bowling_chimpanzee' }));
	app.use(express.session());
	app.use(app.router);
	app.use(express.static(path.join(__dirname, 'public' )));
});

app.configure( 'development', function() {
  app.use( express.errorHandler() );
});

var Silencer = {
	PAGE_TITLE: 'Silencer',
	MAX_CAP: 1000,
	TRUNCATE_PERCENTAGE: 0.05,
	MIN_TRUNCATE_TOP: 20,
	MIN_TRUNCATE_BOTTOM: 20,
	lookupUrl: 'https://api.twitter.com/1.1/users/lookup.json',
	convertTwitterUser: function( user ) {
		var birth = new Date(user.created_at),
			ageInDays = ( ( new Date() - birth ) / ( 1000*60*60*24 ) ).toFixed( 2 );

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
			ageInDays: ageInDays,
			tweetsPerDay: ( user.statuses_count / ageInDays ).toFixed( 2 )
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
	res.render('index', {
		title: Silencer.PAGE_TITLE,
		login: config.login
	});
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

function errorCallback( error ) {
	console.log( error );
}

app.get( '/:username', function( req, res ) {
	var token = req.session.oauthAccessToken,
			secret = req.session.oauthAccessTokenSecret,
			username = req.params.username;

	if( !token || !secret || !username ) {
		res.redirect( '/' );
		return;
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

			var truncatePercentage = Math.floor( users.length * Silencer.TRUNCATE_PERCENTAGE );
			res.render('user', {
				title: Silencer.PAGE_TITLE + ' for ' + originUser.username,
				logout: config.logout,
				originUser: originUser,
				total: Math.round( totalTweetsPerDay ),
				users: users,
				maxCap: Silencer.MAX_CAP,
				truncateTopLength: Math.max( truncatePercentage, Silencer.MIN_TRUNCATE_TOP ),
				truncateBottomLength: Math.max( truncatePercentage, Silencer.MIN_TRUNCATE_BOTTOM ),
				mean: mean,
				median: median,
				ellipsisShown: false
			});
		}, errorCallback );
	}, errorCallback );
});

app.get( config.login, twitterAuth.oauthConnect );
app.get( config.loginCallback, twitterAuth.oauthCallback );
app.get( config.logout, twitterAuth.logout );

http.createServer( app ).listen( app.get( 'port' ), function(){
	console.log( 'Express server listening on port ' + app.get( 'port' ) );
});