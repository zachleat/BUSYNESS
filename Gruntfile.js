/*global module:false,require:false,console:false */
module.exports = function(grunt) {

	require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);

	// Project configuration.
	grunt.initConfig({
		// Metadata.
		pkg: grunt.file.readJSON('package.json'),
		banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
			'<%= grunt.template.today("yyyy-mm-dd") %>\n' +
			'<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
			'* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author %>;' +
			' <%= pkg.license %> License */\n',
		urls: {
			// from domain root, do not include the first slash, do include a trailing slash
			root: 'public/',
			jsSrc: '<%= urls.root %>javascripts/',
			cssSrc: '<%= urls.root %>stylesheets/',
			imgSrc: '<%= urls.root %>images/',
			distFolder: '<%= urls.root %>dist/',
		},
		// Task configuration.
		concat: {
			options: {
				banner: '<%= banner %>',
				stripBanners: true
			},
			js: {
				src: [
					'<%= urls.jsSrc %>lib/shoestring.js',
					'<%= urls.jsSrc %>lib/connector.js',
					'<%= urls.jsSrc %>lib/globalenhance.js',
					'<%= urls.jsSrc %>lib/tables.stickyheaders.js',
					'<%= urls.jsSrc %>*.js'
				],
				dest: '<%= urls.distFolder %>initial.js'
			}
			// CSS Concat handled by SASS
		},
		sass: {
			dist: {
				options: {
					compass: true,
					style: 'expanded'
				},
				files: {
					'<%= urls.distFolder %>global.css': ['<%= urls.cssSrc %>lib/**/*', '<%= urls.cssSrc %>sass/**/*']
				}
			}
		},
		uglify: {
			options: {
				banner: '<%= banner %>'
			},
			js: {
				src: '<%= concat.js.dest %>',
				dest: '<%= urls.distFolder %>initial.min.js'
			}
		},
		cssmin: {
			dist: {
				options: {
					banner: '<%= banner %>'
				},
				files: {
					'<%= urls.distFolder %>global.min.css': ['<%= urls.distFolder %>global.css']
				}
			}
		},
		shell: {},
		watch: {
			assets: {
				files: ['<%= urls.cssSrc %>**/*', '<%= urls.jsSrc %>**/*'],
				tasks: ['default']
			}
		}
	});

	// Default task.
	grunt.registerTask('assets', ['concat:js', 'sass', 'uglify', 'cssmin']);
	grunt.registerTask('default', ['assets']);
};
