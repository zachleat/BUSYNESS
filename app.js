var express = require( 'express' ),
	http = require( 'http' ),
	path = require( 'path' ),
	routes = require('./routes'),
	twitterConfig = require('./twitter_config.json');

var config = {
	port: 3000,
	domain: "http://localhost:3000",
	login: "/twitter/sessions/connect",
	logout: "/twitter/sessions/logout",
	loginCallback: "/twitter/sessions/callback", /* internal */
	completeCallback: "/u/zachleat"
};
config.consumerKey = twitterConfig.consumerKey;
config.consumerSecret = twitterConfig.consumerSecret;

var twitterAuth = require( 'twitter-oauth' )( config );

var app = express();

app.configure(function(){
	app.set( 'port', config.port);
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

// app.use(express.cookieParser());
// app.use(express.session());
// app.use(express.bodyParser());

app.configure( 'development', function() {
  app.use( express.errorHandler() );
});

app.get( '/', routes.index );

var Silencer = {
	lookupUrl: 'https://api.twitter.com/1.1/users/lookup.json',
	convertTwitterUser: function( user ) {
		return {
			username: user.screen_name,
			name: user.name,
			friends: user.friends_count,
			statuses: user.statuses_count,
			followers: user.followers_count,
			birth: user.created_at,
			listed: user.listed_count,
			favorites: user.favourites_count,
			description: user.description,
			avatar: user.profile_image_url
		};
	}
};

app.get( '/u/:username', twitterAuth.middleware, function( req, res ){
	var token = req.session.oauthAccessToken,
		secret = req.session.oauthAccessTokenSecret;

	twitterAuth.fetch( 'https://api.twitter.com/1.1/friends/ids.json?screen_name=' + req.params.username, token, secret, function( error, data ) {
		var ids = data.ids,
			users = [],
			requestsMade = Math.ceil( ids.length / 100 ) + 1,
			requestsCompleted = 0;

		function lookupCallback( error, lookupData ) {
			if( error ) {
				console.log( error );
			}

			requestsCompleted++;
			if( !error && lookupData ) {
				lookupData.forEach(function(user) {
					users.push( Silencer.convertTwitterUser( user ) );
				});
			}

			if( requestsCompleted == requestsMade ) {
				res.json({
					error: error,
					data: users
				});
			}
		}

		twitterAuth.fetch( Silencer.lookupUrl + '?screen_name=' + req.params.username, token, secret, lookupCallback );

		for( var j = 0, k = ids.length; j<k; j+= 100 ) {
			twitterAuth.fetch( Silencer.lookupUrl + '?user_id=' + ids.slice(j, j + 100), token, secret, lookupCallback );
		}
	});
});

app.get( config.login, twitterAuth.oauthConnect );
app.get( config.loginCallback, twitterAuth.oauthCallback );
app.get( config.logout, twitterAuth.logout );

http.createServer( app ).listen( app.get( 'port' ), function(){
	console.log( 'Express server listening on port ' + app.get( 'port' ) );
});