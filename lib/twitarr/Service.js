(function() {
	'use strict';

	var angular = require('angular'),
		moment = require('moment');

	require('ng-file-upload');

	angular.module('cruisemonkey.Twitarr', [
		/* 'cordovaHTTP', */
		'cruisemonkey.Config',
		'cruisemonkey.DB',
		'cruisemonkey.Initializer',
		'cruisemonkey.Notifications',
		'cruisemonkey.Settings',
		'ngCordova',
		'ngFileUpload',
		'ionic'
	])
	.factory('Twitarr', function($cordovaFileTransfer, $http, $injector, $interval, $ionicPlatform, $log, $q, $rootScope, $timeout, $window, Cordova, kv, LocalNotifications, SettingsService, Upload, UserService) {
		$log.info('Initializing Twit-arr API.');

		var $scope = $rootScope.$new();
		$scope.isForeground = true;

		var cordovaHTTP;
		if ($injector.has('cordovaHTTP')) {
			cordovaHTTP = $injector.get('cordovaHTTP');
		}

		var requestTimeout = parseInt($injector.get('config.request.timeout'), 10) * 1000;
		var enableCachebusting = $injector.get('config.twitarr.enable-cachebusting');
		var useCordovaHTTP = false;
		var ready = $q.defer();

		if ($window.cordova && cordovaHTTP) {
			$log.debug('Twitarr: Cordova HTTP is available.');
			useCordovaHTTP = true;
			cordovaHTTP.acceptAllCerts(true);
			cordovaHTTP.setTimeouts(requestTimeout, requestTimeout);
		} else {
			$log.debug('Twitarr: Cordova HTTP is not available.');
		}

		var updateLastStatus = function() {
			if ($scope.lastStatus === undefined) {
				return kv.remove('cruisemonkey.twitarr.status');
			} else {
				return kv.set('cruisemonkey.twitarr.status', $scope.lastStatus);
			}
		};

		kv.get('cruisemonkey.twitarr.status').then(function(s) {
			$scope.lastStatus = s;
			if (!$scope.lastStatus) {
				$scope.lastStatus = {
					'mention_ids': [],
					'seamail_ids': [],
					'announcement_timestamps': []
				};
			}
			if (!$scope.lastStatus.mention_ids) {
				$scope.lastStatus.mention_ids = [];
			}
			if (!$scope.lastStatus.seamail_ids) {
				$scope.lastStatus.seamail_ids = [];
			}
			if (!$scope.lastStatus.announcement_timestamps) {
				$scope.lastStatus.announcement_timestamps = [];
			}
			if ($scope.lastStatus.announcement_ids) {
				delete $scope.lastStatus.announcement_ids;
			}
			updateLastStatus();
		});

		var call = function(type, url, params, data) {
			return SettingsService.getTwitarrRoot().then(function(twitarrRoot) {
				if (url.indexOf('http') !== 0) {
					url = twitarrRoot + url;
				}

				var options = {
					method: type,
					url: url,
					cache: false,
					timeout: requestTimeout,
					headers: {
						Accept: 'application/json'
					}
				};

				var user = UserService.get();

				if (!params) {
					params = {};
				}
				params = angular.copy(params);
				data = angular.copy(data);

				if (type === 'POST' || type === 'DELETE') {
					if (!params.key) {
						if (user.loggedIn && user.key) {
							params.key = user.key;
						}
					}
				} else {
					if (!params.key) {
						if (user.loggedIn && user.key) {
							params.key = user.key;
						}
					}
				}

				if (type === 'GET' && enableCachebusting) {
					params._x = moment().valueOf();
				}

				options.params = angular.extend({}, params);

				if (options.params.cache) {
					// disable cachebusting for this request
					options.cache = true;
					delete options.params._x;
					delete options.params.cache;
				}

				if (data) {
					//options.data = angular.toJson(data);
					options.data = data;
				}

				//$log.debug('Making HTTP call with options:',options);
				if (useCordovaHTTP) {
					var handleSuccess = function(response) {
						if (response.data) {
							response.data = angular.fromJson(response.data);
						}
						//$log.debug('Twitarr.call: got: ' + angular.toJson(response.data));
						return response;
					};
					var handleError = function(err) {
						$log.error('Twitarr.call: failed: ' + angular.toJson(err));
						return $q.reject(err);
					};

					if (type === 'GET') {
						return cordovaHTTP.get(url, options.params, options.headers).then(handleSuccess, handleError);
					} else if (type === 'PUT') {
						return cordovaHTTP.put(url, options.params, options.headers).then(handleSuccess, handleError);
					} else if (type === 'POST') {
						var p = angular.extend({}, data, options.params);
						return cordovaHTTP.post(url, p, options.headers).then(handleSuccess, handleError);
					}
				} else {
					return $http(options);
				}
			});
		};

		var get = function(url, params) {
			return call('GET', url, params);
		};

		var del = function(url, data) {
			return call('DELETE', url, {}, data);
		};

		var post = function(url, data) {
			return call('POST', url, {}, data);
		};

		var put = function(url, data) {
			return call('PUT', url, {}, data);
		};

		var errorHandler = function(prefix) {
			return function(errorResponse) {
				$log.error(prefix + ': Failed: ' + angular.toJson(errorResponse));
				if (errorResponse.status) {
					return $q.reject([errorResponse.data, errorResponse.status]);
				} else {
					return $q.reject([angular.toJson(errorResponse)]);
				}
			};
		};

		var getAlerts = function(shouldReset) {
			var url = 'api/v2/alerts';
			return get(url, {'no_reset':!shouldReset}).then(function(response) {
				var data = response.data;
				if (data.unread_seamail) {
					for (var i=0; i < data.unread_seamail.length; i++) {
						data.unread_seamail[i].timestamp = moment(data.unread_seamail[i].timestamp);
					}
				}
				return data;
			}, errorHandler('Twitarr.getAlerts()'));
		};

		var getAutocompleteUsers = function(searchPrefix) {
			var username =UserService.get().username;
			var url = 'api/v2/user/autocomplete/' + searchPrefix;

			if (searchPrefix && searchPrefix.trim() !== '') {
				$log.debug('Twitarr.getAutocompleteUsers(): url=' + url);
				return get(url, {cache:true}).then(function(response) {
					for (var i=0; i < response.data.names.length; i++) {
						response.data.names[i] = response.data.names[i].toLowerCase();
					}
					if (username) {
						response.data.names.remove(username.toLowerCase());
					}
					return response.data.names;
				}, errorHandler('Twitarr.getAutocompleteUsers()'));
			} else {
				return $q.when([]);
			}
		};

		var getEvents = function() {
			var url = 'api/v2/event?order=asc';
			//$log.debug('Twitarr.getEvents(): url=' + url);

			/*
			var user = UserService.get();
			if (!user || !user.loggedIn) {
				return $q.reject(['Not logged in.']);
			}
			*/

			return get(url).then(function(result) {
				if (result && result.data.event && result.data.event[0] && result.data.event[0].status === 'ok') {
					return result.data.event[0].events;
				} else {
					return $q.reject(result);
				}
			}, errorHandler('Twitarr.getEvents()'));
		};

		var addEvent = function(eventData) {
			var user = UserService.get();
			if (!user || !user.loggedIn) {
				return $q.reject(['Not logged in.']);
			}

			var url = 'api/v2/event';
			$log.debug('Twitarr.addEvent()');

			return post(url, eventData).then(function(response) {
				$log.debug('addEvent: success: ' + angular.toJson(response));
				return true;
			}, errorHandler('Twitarr.addEvent()'));
		};

		var updateEvent = function(eventData) {
			var user = UserService.get();
			if (!user || !user.loggedIn) {
				return $q.reject(['Not logged in.']);
			}

			var url = 'api/v2/event/' + eventData.id;
			$log.debug('Twitarr.updateEvent(): ' + angular.toJson(eventData));

			return put(url, eventData).then(function(response) {
				$log.debug('updateEvent: success: ' + angular.toJson(response));
				return true;
			}, errorHandler('Twitarr.updateEvent()'));
		};

		var removeEvent = function(eventId) {
			var user = UserService.get();
			if (!user || !user.loggedIn) {
				return $q.reject(['Not logged in.']);
			}
			var url = 'api/v2/event/' + eventId;
			$log.debug('Twitarr.removeEvent(): url=' + url);

			return del(url).then(function(response) {
				$log.debug('removeEvent: success: ' + angular.toJson(response));
				return true;
			}, errorHandler('Twitarr.removeEvent(' + eventId + ')'));
		};

		var favoriteEvent = function(eventId) {
			var user = UserService.get();
			if (!user || !user.loggedIn) {
				return $q.reject(['Not logged in.']);
			}

			var url = 'api/v2/event/' + eventId + '/favorite';
			return post(url).then(function(response) {
				$log.debug('Twitarr.favoriteEvent(): response = ' + angular.toJson(response));
				return response;
			}, errorHandler('Twitarr.favoriteEvent('+eventId+')'));
		};

		var unfavoriteEvent = function(eventId) {
			var user = UserService.get();
			if (!user || !user.loggedIn) {
				return $q.reject(['Not logged in.']);
			}

			var url = 'api/v2/event/' + eventId + '/favorite';
			return del(url).then(function(response) {
				$log.debug('Twitarr.favoriteEvent(): response = ' + angular.toJson(response));
				return response;
			}, errorHandler('Twitarr.favoriteEvent('+eventId+')'));
		};

		var getForums = function() {
			var url = 'api/v2/forum';
			$log.debug('Twitarr.getForums()');
			return get(url).then(function(response) {
				$log.debug('response: ' + angular.toJson(response));
				if (response.data && response.data['forum_meta']) {
					return response.data['forum_meta'];
				} else {
					return [];
				}
			}, function(errorResponse) {
				$log.error('Twitarr.getForums(): Failed: ' + angular.toJson(errorResponse));
				if (errorResponse.status) {
					return $q.reject([errorResponse.data, errorResponse.status]);
				} else {
					return $q.reject([angular.toJson(errorResponse)]);
				}
			});
		};

		var getForum = function(id) {
			var url = 'api/v2/forum/' + id;
			$log.debug('Twitarr.getForum('+id+')');
			return get(url).then(function(response) {
				$log.debug('response: ' + angular.toJson(response));
				return {};
			}, function(errorResponse) {
				$log.error('Twitarr.getForum('+id+'): Failed: ' + angular.toJson(errorResponse));
				if (errorResponse.status) {
					return $q.reject([errorResponse.data, errorResponse.status]);
				} else {
					return $q.reject([angular.toJson(errorResponse)]);
				}
			});
		};

		var getStatus = function() {
			var user = UserService.get();
			if (!user || !user.loggedIn) {
				return $q.reject(['Not logged in.']);
			}

			var url = 'api/v2/alerts/check';
			$log.debug('Twitarr.getStatus(): url=' + url);

			return get(url).then(function(response) {
				if (response && response.data && response.data.status === 'ok') {
					return response.data.user;
				} else {
					return $q.reject(response);
				}
			}, function(errorResponse) {
				$log.error('Twitarr.getStatus(): Failed: ' + angular.toJson(errorResponse));
				if (errorResponse.status) {
					return $q.reject([errorResponse.data, errorResponse.status]);
				} else {
					return $q.reject([angular.toJson(errorResponse)]);
				}
			});
		};

		var getSeamail = function() {
			var url = 'api/v2/seamail';
			$log.debug('Twitarr.getSeamail(): url=' + url);

			return get(url).then(function(response) {
				var unread = [];
				if (response.data.seamail_meta) {
					for (var i=0; i < response.data.seamail_meta.length; i++) {
						response.data.seamail_meta[i].timestamp = moment(response.data.seamail_meta[i].timestamp);
						if (response.data.seamail_meta[i].is_unread) {
							unread.push(response.data.seamail_meta[i]);
						}
					}
				}

				if (unread.length > 0 && $scope.isForeground) {
					$scope.$broadcast('cruisemonkey.notify.newSeamail', unread);
				}
				$scope.$broadcast('cruisemonkey.notify.unreadSeamail', unread.length);
				return response.data;
			}, function(errorResponse) {
				$log.error('Failed getSeamail(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var postSeamail = function(seamail) {
			var url = 'api/v2/seamail';
			$log.debug('Twitarr.postSeamail(): url=' + url + ', seamail=' + angular.toJson(seamail));

			return post(url, seamail).then(function(response) {
				if (response.data && response.data.errors && response.data.errors.length > 0) {
					$log.error('Failed postSeamail(): ' + response.data.errors[0]);
					return $q.reject(response.data.errors);
				} else {
					return response.data;
				}
			}, function(errorResponse) {
				$log.error('Failed postSeamail(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var getSeamailMessages = function(id) {
			var url = 'api/v2/seamail/' + id;
			$log.debug('Twitarr.getSeamailMessages(): url=' + url);

			return get(url).then(function(response) {
				if (response.data && response.data.seamail && response.data.seamail.messages) {
					for (var i=0; i < response.data.seamail.messages.length; i++) {
						response.data.seamail.messages[i].timestamp = moment(response.data.seamail.messages[i].timestamp);
					}
				}
				return response.data;
			}, function(errorResponse) {
				$log.error('Failed getSeamailMessages(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var postSeamailMessage = function(id, text) {
			var url = 'api/v2/seamail/' + id + '/new_message';
			$log.debug('Twitarr.postSeamailMessage(): url=' + url + ', text=',text);

			return post(url, { text: text }).then(function(response) {
				return response.data;
			}, function(errorResponse) {
				$log.error('Failed postSeamailMessage(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var like = function(tweetId) {
			var url = 'api/v2/stream/' + tweetId + '/like';
			$log.debug('Twitarr.like(): url=' + url);

			return post(url).then(function(response) {
				return response.data;
			}, function(errorResponse) {
				$log.error('Failed like(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var unlike = function(tweetId) {
			var url = 'api/v2/stream/' + tweetId + '/like';
			$log.debug('Twitarr.unlike(): url=' + url);

			return del(url).then(function(response) {
				return response.data;
			}, function(errorResponse) {
				$log.error('Failed unlike(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var getStream = function(nextPage) {
			var url = 'api/v2/stream';
			if (nextPage) {
				url += '?start=' + parseInt(nextPage) + '&older_posts=true';
			}
			$log.debug('Twitarr.getStream(): url=' + url);

			return get(url).then(function(response) {
				return response.data;
			}, function(errorResponse) {
				$log.error('Failed getStream(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var getTweet = function(id) {
			var url = 'api/v2/stream/' + id;
			$log.debug('Twitarr.getTweet(' + id + '): url=' + url);
			return get(url).then(function(response) {
				return response.data;
			}, function(errorResponse) {
				$log.error('Failed getTweet(' + id + '): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var postTweet = function(tweet) {
			var url = 'api/v2/stream';
			$log.debug('Twitarr.postTweet(): url=' + url);

			return post(url, tweet).then(function(response) {
				return response.data;
			}, function(errorResponse) {
				$log.error('Failed postTweet(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject([errorResponse.data, errorResponse.status]);
			});
		};

		var postPhoto = function(image) {
			var url = 'api/v2/photo';
			var user = UserService.get();

			var fileName, mimeType;
			if (image instanceof File) {
				fileName = image.name;
				mimeType = image.type;
			} else {
				fileName = image.substr(image.lastIndexOf('/') + 1) || image;
				mimeType = image.match(/\.png$/)? 'image/png':'image/jpeg';
			}

			if (typeof FileTransfer !== 'undefined') {
				var deferred = $q.defer();
				SettingsService.getTwitarrRoot().then(function(twitarrRoot) {
					url = twitarrRoot + url;
					$log.debug('Twitarr.postPhoto(): url=' + url + ', image=' + image);

					var ft = new FileTransfer();
					var opts = new FileUploadOptions();
					opts.mimeType = mimeType;
					opts.httpMethod = 'POST';
					opts.chunkedMode = false;
					opts.fileName = fileName;
					opts.headers = {
						Connection: 'close'
					};
					if (user.key) {
						opts.params = {
							key: user.key,
							files: [opts.fileName]
						};
					}
					ft.onprogress = function(progress) {
						$scope.$evalAsync(function() {
							deferred.notify(progress);
						});
					};

					ft.upload(image, encodeURI(url), function success(result) {
						$scope.$evalAsync(function() {
							$log.debug('Twitarr.postPhoto(): success! ' + angular.toJson(result));
							deferred.resolve(result);
						});
					}, function err(res) {
						$scope.$evalAsync(function() {
							$log.error('Twitarr.postPhoto(): failure. ' + angular.toJson(res));
							deferred.reject(res);
						});
					}, opts);
				});
				return deferred.promise;
			} else {
				if (user.key) {
					url += '?key=' + user.key;
				}
				return SettingsService.getTwitarrRoot().then(function(twitarrRoot) {
					return Upload.upload({
						'url': twitarrRoot + url,
						'file': image,
						'fileFormDataName': 'files',
						'fileName': fileName
					}).then(function(res) {
						$log.debug('Twitarr.postPhoto(): success! ' + angular.toJson(res));
						return res;
					}, function(err) {
						$log.error('Twitarr.postPhoto(): failure. ' + angular.toJson(err));
						return $q.reject(err);
					});
				});
			}
		};

		var getUserInfo = function(username) {
			var url = 'api/v2/user/view/' + username;
			$log.debug('Twitarr.getUserInfo: url=' + url);

			return get(url).then(function(response) {
				if (response.data.user) {
					return response.data.user;
				} else {
					return undefined;
				}
			}, function(errorResponse) {
				$log.error('Failed getUserInfo(): ' + errorResponse.status, angular.toJson(errorResponse.data));
				return $q.reject(errorResponse.data);
			});
		};

		var sendMentionNotification = function(mention, count) {
			$log.debug('Twitarr: Sending mention local notification for:',mention);

			var options = {
				id: 'mention-' + mention.id,
				message: 'Mentioned by @' + mention.author + ': ' + mention.text.replace(/<\S[^><]*>/g, ''),
				data: mention
			};
			if (count) {
				options.badge = count;
			}

			$scope.$broadcast('cruisemonkey.notify.local', options);
		};

		var sendAnnouncementNotification = function(announcement, count) {
			$log.debug('Twitarr: Sending announcement local notification for:',announcement);

			var options = {
				id: 'announcement-' + announcement.timestamp.valueOf(),
				message: 'New Announcement: ' + announcement.text,
				data: announcement
			};
			if (count) {
				options.badge = count;
			}

			$scope.$broadcast('cruisemonkey.notify.local', options);
		};

		var sendSeamailNotification = function(seamail, count) {
			$log.debug('Twitarr: Sending seamail local notification for:',seamail);

			var options = {
				id: 'seamail-' + seamail.id,
				message: 'New Seamail: ' + seamail.subject,
				data: seamail
			};
			if (count) {
				options.badge = count;
			}

			$scope.$broadcast('cruisemonkey.notify.local', options);
		};

		var sendSeamailNotifications = function() {
			var newSeamails = [], i;
			getSeamail().then(function(res) {
				if (res.seamail_meta) {
					for (i=0; i < res.seamail_meta.length; i++) {
						if (res.seamail_meta[i].is_unread) {
							newSeamails.push(res.seamail_meta[i]);
						}
					}
				}

				for (i=0; i < newSeamails.length; i++) {
					sendSeamailNotification(res.seamail_meta[i], newSeamails.length);
				}
			});
		};

		var checkStatus = function() {
			var deferred = $q.defer();

			var user = UserService.get();
			if (user.loggedIn && user.key) {
				$log.debug('Twitarr: doing status check');
				getAlerts(false).then(function(alerts) {
					var i,
						new_mentions = [], mention,
						new_announcements = [], announcement,
						new_seamails = [], seamail;

					var seen = {
						mention_ids: [],
						seamail_ids: [],
						announcement_timestamps: []
					};

					if (alerts.tweet_mentions) {
						for (i=0; i < alerts.tweet_mentions.length; i++) {
							mention = alerts.tweet_mentions[i];
							seen.mention_ids.push(mention.id);
							if (scope.lastStatus.mention_ids.includes(mention.id)) {
								//$log.debug('Twitarr.checkStatus: already seen mention: ' + mention.id);
							} else {
								$log.debug('Twitarr.checkStatus: new mention: ' + mention.id);
								new_mentions.push(mention);
							}
						}
						if (new_mentions.length > 0 && $scope.isForeground) {
							$scope.$broadcast('cruisemonkey.notify.newMentions', new_mentions);
						}
						$scope.$broadcast('cruisemonkey.notify.unseenMentions', alerts.tweet_mentions.length);
					}
					if (alerts.announcements) {
						for (i=0; i < alerts.announcements.length; i++) {
							announcement = alerts.announcements[i];
							announcement.timestamp = moment(announcement.timestamp);
							seen.announcement_timestamps.push(announcement.timestamp.valueOf());
							if (scope.lastStatus.announcement_timestamps.includes(announcement.timestamp.valueOf())) {
								//$log.debug('Twitarr.checkStatus: already seen announcement: ' + announcement.id);
							} else {
								$log.debug('Twitarr.checkStatus: new announcement: ' + announcement.text);
								new_announcements.push(announcement);
							}
						}
						if (new_announcements.length > 0 && $scope.isForeground) {
							$scope.$broadcast('cruisemonkey.notify.newAnnouncements', new_announcements);
						}
					}
					if (alerts.unread_seamail) {
						for (i=0; i < alerts.unread_seamail.length; i++) {
							seamail = alerts.unread_seamail[i];
							seen.seamail_ids.push(seamail.id);
							if (scope.lastStatus.seamail_ids.includes(seamail.id)) {
								//$log.debug('Twitarr.checkStatus: already seen seamail: ' + seamail.id);
							} else {
								$log.debug('Twitarr.checkStatus: new seamail: ' + seamail.id);
								new_seamails.push(seamail);
							}
						}
						if (new_seamails.length > 0 && $scope.isForeground) {
							$scope.$broadcast('cruisemonkey.notify.newSeamail', new_seamails);
						}
						$scope.$broadcast('cruisemonkey.notify.unreadSeamail', alerts.unread_seamail.length);
					}

					var count = new_mentions.length + new_announcements.length + new_seamails.length;

					for (i=0; i < new_mentions.length; i++) {
						sendMentionNotification(new_mentions[i], count);
					}
					for (i=0; i < new_announcements.length; i++) {
						sendAnnouncementNotification(new_announcements[i], count);
					}
					for (i=0; i < new_seamails.length; i++) {
						sendSeamailNotification(new_seamails[i], count);
					}

					$scope.lastStatus = seen;
					updateLastStatus();
					deferred.resolve(true);
				});
			} else {
				$log.debug('Twitarr: skipping status check, user is not logged in');
				deferred.resolve(false);
			}

			return deferred.promise;
		};

		var configureBackgroundFetch = function() {
			$ionicPlatform.ready(function() {
				if ($window.plugins && $window.plugins.backgroundFetch) {
					var fetcher = $window.plugins.backgroundFetch;
					$log.debug('Twitarr: Configuring background fetch.');
					fetcher.configure(function() {
						$scope.$evalAsync(function() {
							$log.debug('Twitarr: Background fetch initiated.');
							checkStatus().then(function() {
								$log.debug('Twitarr: Background fetch complete.');
								fetcher.finish();
							}, function(err) {
								$log.debug('Twitarr: Background fetch failed: ' + angular.toJson(err));
							});
						});
					});
				}
			});
		};

		var statusIntervalCallback = function() {
			Cordova.inCordova().then(function() {
				// if we're in Cordova, only run the interval check when we're in the foreground
				if (scope.isForeground) {
					checkStatus();
				}
			}, function() {
				// outside of cordova, just assume we should do it
				checkStatus();
			});
		};

		var _statusCheck;
		var startStatusCheck = function() {
			if (_statusCheck) {
				return;
			}
			_statusCheck = $interval(statusIntervalCallback, SettingsService.getBackgroundInterval() * 1000);
		};
		var stopStatusCheck = function() {
			if (_statusCheck) {
				$interval.cancel(_statusCheck);
			}
		};

		var onForeground = function() {
			$scope.isForeground = true;
			LocalNotifications.clear();
			startStatusCheck();
		};
		var onBackground = function() {
			$scope.isForeground = false;
			stopStatusCheck();
		};

		/* start status check on launch or resume */
		$scope.$on('cruisemonkey.app.resumed', onForeground);
		checkStatus();

		/* stop status check when backgrounded or shut down */
		$scope.$on('cruisemonkey.app.paused', onBackground);
		$scope.$on('cruisemonkey.app.locked', onBackground);
		$scope.$on('$destroy', stopStatusCheck);

		/* configure background fetch to run whenever it thinks it should ;) */
		configureBackgroundFetch();

		$scope.$on('cruisemonkey.user.settings-changed', function(ev, settings) {
			if (settings.old && settings.new.backgroundInterval !== settings.old.backgroundInterval) {
				$log.debug('Twitarr: background interval refresh has changed from ' + settings.old.backgroundInterval + ' to ' + settings.new.backgroundInterval + '.');
				stopStatusCheck();
				startStatusCheck();
			}
		});

		return {
			getStream: getStream,
			getTweet: getTweet,
			postTweet: postTweet,
			postPhoto: postPhoto,

			getUserInfo: getUserInfo,

			getStatus: getStatus,
			getAlerts: getAlerts,

			getAutocompleteUsers: getAutocompleteUsers,

			getEvents: getEvents,
			addEvent: addEvent,
			updateEvent: updateEvent,
			removeEvent: removeEvent,
			favoriteEvent: favoriteEvent,
			unfavoriteEvent: unfavoriteEvent,

			getForums: getForums,

			getSeamail: getSeamail,
			postSeamail: postSeamail,
			getSeamailMessages: getSeamailMessages,
			postSeamailMessage: postSeamailMessage,

			like: like,
			unlike: unlike
		};
	});
}());