(function () {
	'use strict';

	/*global TestFlight: true*/
	/*global isMobile: true*/

	angular.module('cruisemonkey',
	[
		'ionic',
		'ui.router',
		'angularLocalStorage',
		'pasvaz.bindonce',
		'cruisemonkey.Config',
		'cruisemonkey.Cordova',
		'cruisemonkey.controllers.About',
		'cruisemonkey.controllers.Advanced',
		'cruisemonkey.controllers.Amenities',
		'cruisemonkey.controllers.DeckList',
		'cruisemonkey.controllers.Events',
		'cruisemonkey.controllers.Help',
		'cruisemonkey.controllers.Login',
		'cruisemonkey.controllers.Logout',
		'cruisemonkey.controllers.Navigation',
		'cruisemonkey.controllers.Photos',
		'cruisemonkey.Database',
		'cruisemonkey.Notifications',
		'cruisemonkey.Seamail',
		'cruisemonkey.User'
	])
	.config(['$stateProvider', '$urlRouterProvider', '$compileProvider', function($stateProvider, $urlRouterProvider, $compileProvider) {
		$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|file|tel):/);
		$compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|file):/);

		$urlRouterProvider.otherwise('/events/official');

		$stateProvider
			.state('login', {
				url: '/login',
				templateUrl: 'template/login.html',
				controller: 'CMLoginCtrl'
			})
			.state('logout', {
				url: '/logout',
				templateUrl: 'template/logout.html',
				controller: 'CMLogoutCtrl'
			})
			.state('amenities', {
				url: '/amenities',
				templateUrl: 'template/amenities.html',
				controller: 'CMAmenitiesCtrl'
			})
			.state('events', {
				url: '/events/:eventType',
				templateUrl: 'template/event-list.html',
				controller: 'CMEventCtrl'
			})
			.state('deck-plans', {
				url: '/deck-plans/:deck',
				templateUrl: 'template/deck-plans.html',
				controller: 'CMDeckListCtrl'
			})
			.state('photos', {
				url: '/photos',
				templateUrl: 'template/photos.html',
				controller: 'CMPhotoCtrl'
			})
			.state('help', {
				url: '/help',
				templateUrl: 'template/help.html',
				controller: 'CMHelpCtrl'
			})
			.state('about', {
				url: '/about',
				templateUrl: 'template/about.html',
				controller: 'CMAboutCtrl'
			})
			.state('advanced', {
				url: '/advanced',
				templateUrl: 'template/advanced.html',
				controller: 'CMAdvancedCtrl'
			});
	}])
	.run(['$q', '$rootScope', '$window', '$location', '$timeout', '$interval', '$urlRouter', '$http', 'UserService', 'storage', 'CordovaService', 'Database', 'LoggingService', 'NotificationService', 'SettingsService', 'SeamailService', function($q, $rootScope, $window, $location, $timeout, $interval, $urlRouter, $http, UserService, storage, cor, Database, log, notifications, SettingsService, SeamailService) {
		log.debug('CruiseMonkey run() called.');

		$rootScope.safeApply = function(fn) {
			var phase = this.$root.$$phase;
			if(phase === '$apply' || phase === '$digest') {
				if(fn && (typeof(fn) === 'function')) {
					fn();
				}
			} else {
				this.$apply(fn);
			}
		};

		$window.handleOpenURL = function(url) {
			var translated = url.replace('cruisemonkey://','/');
			$rootScope.safeApply(function() {
				$location.path(translated);
			});
		};

		$rootScope.openLeft = function() {
			log.info('Opening Sidebar.');
			$rootScope.sideMenuController.toggleLeft();
		};

		$rootScope.closeLeft = function() {
			log.info('Closing Sidebar.');
			$rootScope.sideMenuController.close();
		};

		$rootScope.openSeamail = function() {
			$window.open(SettingsService.getTwitarrRoot() + '#/seamail/inbox', '_blank');
			/*
			cor.ifCordova(function() {
			}).otherwise(function() {
				$window.open(SettingsService.getTwitarrRoot() + '#/seamail/inbox', '_blank');
			});
			*/
		};

		$rootScope.$on('$locationChangeSuccess', function(evt, newUrl, oldUrl) {
			$rootScope.user = UserService.get();

			evt.preventDefault();

			if (UserService.loggedIn()) {
				$urlRouter.sync();
				angular.noop();
				storage.set('cm.lasturl', newUrl);
				return;
			}

			if (newUrl.endsWith('/events') || newUrl.endsWith('/events/')) {
				$location.path('/events/official');
				angular.noop();
				storage.set('cm.lasturl', newUrl);
				return;
			}

			if (newUrl.endsWith('/events/my')) {
				$location.path('/login');
				angular.noop();
				storage.set('cm.lasturl', newUrl);
				return;
			}

			$urlRouter.sync();
			storage.set('cm.lasturl', newUrl);
			angular.noop();

			return;
		});


		$rootScope.$on('$viewContentLoaded', function(evt, toState, toParams, fromState, fromParams) {
			$rootScope.sideMenuController.close();
		});

		var savedUrl = storage.get('cm.lasturl');
		if (savedUrl) {
			var index = savedUrl.indexOf('#');
			if (index > -1) {
				savedUrl = savedUrl.substring(savedUrl.indexOf('#') + 1);
				$location.path(savedUrl);
			}
		}

		var firstStart = true;
		var databaseInitialized = $q.defer();
		$rootScope.foreground = true;
		// if we're not mobile, we don't know if we're online or not, so set it online
		$rootScope.online = !isMobile;

		var handleStateChange = function() {
			databaseInitialized.promise.then(function() {
				if ($rootScope.foreground && $rootScope.online) {
					log.debug('handleStateChange: setting online');
					if (firstStart) {
						firstStart = false;
						$q.when(Database.syncRemote())['finally'](function() {
							// no matter whether it works or not, set everything else up
							Database.online();
							SeamailService.online();
						});
					} else {
						Database.online();
						SeamailService.online();
					}
				} else {
					log.debug('handleStateChange: setting offline');
					Database.offline();
					SeamailService.offline();
				}
			});
		};
		handleStateChange();

		$rootScope.$watch('foreground', function(newValue, oldValue) {
			if (newValue === oldValue) {
				log.warn('foreground: ' + oldValue + ' -> ' + newValue);
				return;
			}
			log.debug('foreground status is now ' + $rootScope.foreground);
			handleStateChange();
		});
		$rootScope.$watch('online', function(newValue, oldValue) {
			if (newValue === oldValue) {
				log.warn('online: ' + oldValue + ' -> ' + newValue);
				return;
			}
			log.debug('online status is now ' + $rootScope.online);
			handleStateChange();
		});

		document.addEventListener('pause', function() {
			$rootScope.safeApply(function() {
				$rootScope.foreground = false;
			});
		}, false);
		document.addEventListener('resume', function() {
			$rootScope.safeApply(function() {
				$rootScope.foreground = true;
			});
		}, false);

		document.addEventListener('offline', function() {
			$rootScope.safeApply(function() {
				$rootScope.online = false;
			});
		}, false);
		document.addEventListener('online', function() {
			$rootScope.safeApply(function() {
				$rootScope.online = true;
			});
		}, false);

		Database.initialize().then(function() {
			databaseInitialized.resolve(true);
			$rootScope.$broadcast('cm.main.databaseInitialized');
		}, function(err) {
			log.error('Failed to initialize database!');
			databaseInitialized.reject(err);
		});

		$rootScope.$on('cm.loggedIn', function(event) {
			log.info('User "' + UserService.getUsername() + '" logged in.');
		});
		$rootScope.$on('cm.loggedOut', function(event) {
			log.info('User logged out.');
		});
	}])
	;
}());
