var express = require( 'express' ),
	http = require( 'http' ),
	path = require( 'path' ),
	config = require('./config.json'),
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
		title: 'Twitter Silencer',
		login: config.login
	});
});

app.get( '/:username', function( req, res ) {
	Silencer.middleware( req, res, function( token, secret, username ) {
		twitterAuth.fetch( 'https://api.twitter.com/1.1/friends/ids.json?screen_name=' + username, token, secret, function( error, data ) {
			if( !data || !data.ids ) {
				res.redirect( '/' );
				return;
			}

			var ids = data.ids.slice( 0, Silencer.MAX_CAP ),
				originUser,
				users = [],
				requestsMade = Math.ceil( ids.length / 100 ) + 1,
				requestsCompleted = 0,
				totalTweetsPerDay = 0,
				mean,
				median;

			function finishedCallback() {
				// sort users by tweets per day desc
				users = users.sort(function(a, b) {
					return b.tweetsPerDay - a.tweetsPerDay;
				});

				median = users[ Math.floor( users.length / 2 ) ].tweetsPerDay;
				mean = ( totalTweetsPerDay / users.length ).toFixed( 2 );

				var truncatePercentage = Math.floor( users.length * Silencer.TRUNCATE_PERCENTAGE );
				res.render('friends', {
					title: 'Twitter Silencer',
					logout: config.logout,
					originUser: originUser,
					total: Math.round( totalTweetsPerDay ),
					friends: users.length,
					users: users,
					maxCap: Silencer.MAX_CAP,
					truncateTopLength: Math.max( truncatePercentage, Silencer.MIN_TRUNCATE_TOP ),
					truncateBottomLength: Math.max( truncatePercentage, Silencer.MIN_TRUNCATE_BOTTOM ),
					mean: mean,
					median: median,
					ellipsisShown: false
				});
			}

			twitterAuth.fetch( Silencer.lookupUrl + '?screen_name=' + username, token, secret, function( error, data ) {
				if( error ) {
					console.log( error );
				}

				requestsCompleted++;
				if( !error && data && data.length ) {
					originUser = Silencer.convertTwitterUser( data[ 0 ] );
				}

				if( requestsCompleted == requestsMade ) {
					finishedCallback();
				}
			});

			for( var j = 0, k = ids.length; j<k; j+= 100 ) {
				twitterAuth.fetch( Silencer.lookupUrl + '?user_id=' + ids.slice(j, j + 100), token, secret, function( error, lookupData ) {
					if( error ) {
						console.log( error );
					}

					requestsCompleted++;
					if( !error && lookupData ) {
						lookupData.forEach(function( user ) {
							var converted = Silencer.convertTwitterUser( user );
							totalTweetsPerDay += +converted.tweetsPerDay;

							users.push( converted );
						});
					}

					if( requestsCompleted == requestsMade ) {
						finishedCallback();
					}
				});
			}
		});
	});
});

app.get( config.login, twitterAuth.oauthConnect );
app.get( config.loginCallback, twitterAuth.oauthCallback );
app.get( config.logout, twitterAuth.logout );

http.createServer( app ).listen( app.get( 'port' ), function(){
	console.log( 'Express server listening on port ' + app.get( 'port' ) );
});