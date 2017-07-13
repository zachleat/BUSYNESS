*This project is Retired.* This was a project to see a list of your noisiest twitter friends.

* [busyness.io (if it’s still up)](http://busyness.io)
* [Read the blog post](https://www.zachleat.com/web/busyness/)
* [Sample output](https://www.zachleat.com/busyness-sample/)

# Development

Install

    npm install

Configure

* Rename `twitter_config.sample.json` to `twitter_config.json` and add your own twitter keys obtained from [dev.twitter.com](https://dev.twitter.com/).

Run

    node app.js

Browse

    http://localhost:3000

# Production

Heroku Environment Variables

* `NODE_ENV = 'production'`
* `consumerKey = ''`
* `consumerSecret = ''`
* `NODEFLY_ID = ''`
* `SESSION_SECRET = ''` (optional)

# Sources

* [Briefcase Icon](http://www.iconfinder.com/icondetails/61690/128/briefcase_carreer_suitcase_icon)
