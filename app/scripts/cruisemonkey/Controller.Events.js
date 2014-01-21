(function() {
	'use strict';

	/*global moment: true*/
	/*global Modernizr: true*/
	/*global CMEvent: true*/
	angular.module('cruisemonkey.controllers.Events', [
		'ui.router',
		'ionic',
		'angularLocalStorage',
		'cruisemonkey.User',
		'cruisemonkey.Events',
		'cruisemonkey.Logging'
	])
	.filter('orderByEvent', function() {
		return function(input, searchString) {
			if (!angular.isObject(input)) { return input; }

			var array = [];
			angular.forEach(input, function(obj, index) {
				obj.setNewDay(false);
				if (obj.matches(searchString)) {
					array.push(obj);
				}
			});

			var attrA, attrB;

			array.sort(function(a,b) {
				attrA = a.getStart();
				attrB = b.getStart();

				if (attrA.isBefore(attrB)) {
					return -1;
				}
				if (attrA.isAfter(attrB)) {
					return 1;
				}

				attrA = a.getSummary().toLowerCase();
				attrB = b.getSummary().toLowerCase();

				if (attrA > attrB) { return 1; }
				if (attrA < attrB) { return -1; }

				attrA = a.getEnd();
				attrB = b.getEnd();

				if (attrA.isBefore(attrB)) { return -1; }
				if (attrA.isAfter(attrB)) { return 1; }

				return 0;
			});

			var lastStart, start;
			angular.forEach(array, function(value, index) {
				value.setNewDay(false);
				start = value.getStart();

				if (index === 0) {
					value.setNewDay(true);
				} else {
					if (start.isAfter(lastStart, 'day')) {
						value.setNewDay(true);
					}
				}

				lastStart = start;
			});

			if (array.length > 0) {
				array[0].setNewDay(true);
			}

			return array;
		};
	})
	.controller('CMEditEventCtrl', ['$q', '$scope', '$rootScope', 'UserService', 'LoggingService', function($q, $scope, $rootScope, UserService, log) {
		log.info('Initializing CMEditEventCtrl');

		if ($rootScope.editEvent) {
			$scope.event = $rootScope.editEvent.toEditableBean();
			delete $rootScope.editEvent;

			log.debug('Found existing event to edit.');
			// console.log($scope.event);
		} else {
			var ev = new CMEvent();
			ev.setStart(moment());
			ev.setEnd(ev.getStart().add('hours', 1));
			ev.setUsername(UserService.getUsername());
			ev.setPublic(true);
			$scope.event = ev.toEditableBean();

			log.debug('Created fresh event.');
			// console.log($scope.event);
		}
	}])
	.controller('CMEventCtrl', ['storage', '$scope', '$rootScope', '$timeout', '$stateParams', '$location', '$q', '$ionicModal', '$templateCache', 'UserService', 'events', 'EventService', 'LoggingService', function(storage, $scope, $rootScope, $timeout, $stateParams, $location, $q, $ionicModal, $templateCache, UserService, events, EventService, log) {
		if (!$stateParams.eventType) {
			$location.path('/events/official');
			return;
		}

		log.info('Initializing CMEventCtrl');

		$scope.eventType = $stateParams.eventType;
		$rootScope.title = $scope.eventType.capitalize() + ' Events';

		storage.bind($scope, 'searchString', {
			'storeName': 'cm.event.' + $scope.eventType
		});
		log.debug('$scope.searchString: ' + $scope.searchString);

		$scope.events = events;

		var timeout = null;
		var doRefresh = function() {
			var deferred = $q.defer();

			log.info('CMEventCtrl.doRefresh(): refreshing.');
			if ($scope.eventType === 'official') {
				$q.when(EventService.getOfficialEvents()).then(function(e) {
					deferred.resolve(true);
					$scope.events = e;
					$scope.$broadcast('scroll.resize');
				});
			} else if ($scope.eventType === 'unofficial') {
				$q.when(EventService.getUnofficialEvents()).then(function(e) {
					deferred.resolve(true);
					$scope.events = e;
					$scope.$broadcast('scroll.resize');
				});
			} else if ($scope.eventType === 'my') {
				$q.when(EventService.getMyEvents()).then(function(e) {
					deferred.resolve(true);
					$scope.events = e;
					$scope.$broadcast('scroll.resize');
				});
			} else {
				log.warn('CMEventCtrl.doRefresh(): unknown event type: ' + $scope.eventType);
				$timeout(function() {
					deferred.resolve(false);
				})
			}

			return deferred.promise;
		};

		var refreshInterval = 5;
		var refreshEvents = function(immediately) {
			if (timeout) {
				log.debug('CMEventCtrl.refreshEvents(): Refresh already in-flight.  Skipping.');
				return;
			} else if (immediately) {
				log.debug('CMEventCtrl.refreshEvents(): Refreshing immediately.');
				doRefresh();
			} else {
				log.debug('CMEventCtrl.refreshEvents(): Refreshing in ' + refreshInterval + ' seconds.');
				timeout = $timeout(function() {
					timeout = null;
					doRefresh();
				}, refreshInterval * 1000);
			}
		};

		$ionicModal.fromTemplateUrl('edit-event.html', function(modal) {
			$scope.modal = modal;
		}, {
			scope: $scope,
			animation: 'slide-in-up'
		});

		$scope.$on('cm.documentUpdated', function(ev, doc) {
			refreshEvents();
		});
		$scope.$on('cm.documentDeleted', function(ev, doc) {
			refreshEvents();
		});
		$scope.$on('cm.localDatabaseSynced', function(ev) {
			log.debug('CMEventCtrl: local database synced, refreshing');
			doRefresh().then(function() {
				$rootScope.notificationText = undefined;
			});
		});

		$scope.clearSearchString = function() {
			$scope.searchString = undefined;
		};

		$scope.prettyDate = function(date) {
			return date? date.format('dddd, MMMM Do') : undefined;
		};

		$scope.fuzzy = function(date) {
			return date? date.fromNow() : undefined;
		};

		$scope.justTime = function(date) {
			return date? date.format('hh:mma') : undefined;
		};

		$scope.trash = function(ev) {
			var eventId = ev.getId();
			for (var i=0; i < $scope.events.length; i++) {
				if ($scope.events[i].getId() == eventId) {
					$scope.events.splice(i, 1);
					$scope.$broadcast('scroll.resize');
					break;
				}
			}
			EventService.removeEvent(ev);
		};

		$scope.edit = function(ev) {
			$scope.safeApply(function() {
				$scope.event = ev;
				$scope.eventData = ev.toEditableBean();

				$scope.modal.show();
			});
		};

		$scope.onFavoriteChanged = function(event) {
			$scope.safeApply(function() {
				var eventId = event.getId();
				log.debug('CMEventCtrl.onFavoriteChanged(' + eventId + ')');

				if (event.isFavorite()) {
					event.setFavorite(undefined);
					for (var i = 0; i < $scope.events.length; i++) {
						if ($scope.events[i].getId() === eventId) {
							$scope.events.splice(i, 1);
							$scope.$broadcast('scroll.resize');
							break;
						}
					}
					EventService.removeFavorite(eventId);
				} else {
					var existing;
					for (var i = 0; i < $scope.events.length; i++) {
						if ($scope.events[i].getId() === eventId) {
							existing = $scope.events[i];
							break;
						}
					}

					if (!existing) {
						log.warn('Somehow favorited an event that does not exist! (' + eventId + ')');
						return;
					}

					EventService.addFavorite(eventId).then(function(fav) {
						fav.setEvent(existing);
						existing.setFavorite(fav);
						$scope.$broadcast('scroll.resize');
					});
				}
			});
		};

		$scope.onPublicChanged = function(ev) {
			console.log('onPublicChanged(' + ev.getId() + ')');
			$scope.safeApply(function() {
				ev.setPublic(!ev.isPublic());
				$scope.$broadcast('scroll.resize');
				EventService.updateEvent(ev).then(function() {
					refreshEvents(true);
				});
			});
		};

		$scope.cancelModal = function() {
			log.debug('closing modal (cancel)');
			$scope.event = undefined;
			$scope.eventData = undefined;
			$scope.modal.hide();
		};

		$scope.saveModal = function(data) {
			log.debug('closing modal (save)');
			
			var ev = $scope.event;
			ev.fromEditableBean(data);

			console.log('saving=', ev.toEditableBean());

			if (ev.getRevision() && $scope.events) {
				// update the existing event in the UI
				for (var i = 0; i < $scope.events.length; i++) {
					var existing = $scope.events[i];
					if (existing.getId() === ev.getId()) {
						$scope.events[i] = ev;
						$scope.$broadcast('scroll.resize');
						break;
					}
				}
			}
			$q.when(EventService.addEvent(ev)).then(function(res) {
				console.log('event added:', res);
				$scope.modal.hide();
				refreshEvents(true);
			});
		};

		var newButtons = [];
		if (UserService.getUsername() && UserService.getUsername() !== '') {
			newButtons = [
				{
					type: 'button-positive',
					content: '<i class="icon icon-cm active ion-ios7-plus"></i>',
					tap: function(e) {
						var ev = new CMEvent();
						ev.setStart(moment());
						ev.setEnd(ev.getEnd().add('hours', 1));
						ev.setUsername(UserService.getUsername());
						ev.setPublic(true);

						$scope.event = ev;
						$scope.eventData = ev.toEditableBean();

						$scope.modal.show();
					}
				}
			];
		}
		$rootScope.rightButtons = newButtons;
	}]);
}());
