(function() {
	'use strict';

	var datetime = require('../util/datetime'),
		model = require('../data/Model'),
		CMEvent = model.CMEvent,
		CMDay = model.CMDay;

	require('ionic-filter-bar');
	require('ion-sticky');

	require('./Edit');

	var boatImage = require('../data/boat.svg');

	var templates = {
		eventsChooser: require('ngtemplate!html!./chooser.html'),
		eventEdit: require('ngtemplate!html!./edit.html')
	};

	var withDays = function(events) {
		var ret = [],
			lastDay = datetime.create('1970-01-01 00:00'),
			currentDay = null,
			even = true;

		for (var i=0, len=events.length, ev; i < len; i++) {
			ev = events[i];
			currentDay = ev.getDay();
			if (!lastDay.isSame(currentDay)) {
				ret.push(new CMDay(currentDay));
				lastDay = currentDay;
				even = true;
			}
			even = !even;
			ev.setEven(even);
			ret.push(ev);
		}

		return ret;
	};

	var findElementById = function(id) {
		/* eslint-disable no-console */
		var elm, scrollEl, position = 0;
		elm = document.getElementById(id);
		if (elm) {
			scrollEl = angular.element(elm);
			while (scrollEl) {
				if (scrollEl.hasClass('scroll-content')) {
					break;
				}
				var offsetTop = scrollEl[0].offsetTop,
					scrollTop = scrollEl[0].scrollTop,
					clientTop = scrollEl[0].clientTop;
				position += offsetTop - scrollTop + clientTop;
				scrollEl = scrollEl.parent();
			}
			//console.log('offset='+position);
			if (position < 10) {
				return 0;
			}
			return position;
			/* $scope.$broadcast('scroll.scrollTo', 0, position, true); */
		} else {
			console.log('can\'t find element ' + id);
			return 0;
		}
		/* eslint-enable no-console */
	};

	angular.module('cruisemonkey.controllers.Events', [
		'ui.router',
		'ionic',
		'ion-sticky',
		'jett.ionic.filter.bar',
		'cruisemonkey.DB',
		'cruisemonkey.Events',
		'cruisemonkey.events.Edit',
		'cruisemonkey.user.User'
	])
	.filter('eventFilter', function($log) {
		return function(cmEvents, searchString) {
			var matches = cmEvents.filter(function(ev) {
				if (ev instanceof CMDay) {
					return false;
				}
				return ev instanceof CMEvent && ev.matches(searchString);
			});
			return withDays(matches);
		};
	})
	.controller('CMEventsCtrl', function($filter, $ionicActionSheet, $ionicFilterBar, $ionicLoading, $ionicModal, $ionicPlatform, $ionicPopover, $ionicPopup, $ionicScrollDelegate, $location, $log, $q, $scope, $state, $timeout, EditEvent, EventService, kv, UserService) {
		$log.info('Initializing CMEventsCtrl');

		var defaultEventType = 'all';
		var firstRefresh = true;

		$scope.eventType = defaultEventType;
		$scope.eventTypes = ['official', 'shadow', 'all'];
		$scope.events = [];
		$scope.user = {};
		$scope.u = UserService;
		$scope.officialIcon = boatImage;

		$scope.getEventTypeDescription = function() {
			return $scope.eventType === 'followed'? 'Followed' : $scope.eventType.capitalize();
		};

		var filterBarInstance;

		var popover = $ionicPopover.fromTemplateUrl(templates['eventsChooser'], {
			scope: $scope
		});

		kv.get('cruisemonkey.events.event-type').then(function(et) {
			$scope.setEventType(et || defaultEventType);
		}, function() {
			$scope.setEventType(defaultEventType);
		});

		$scope.showFilterBar = function() {
			filterBarInstance = $ionicFilterBar.show({
				items: $scope.events,
				debounce: true,
				filter: $filter('eventFilter'),
				update: function (filteredItems, filterText) {
					$scope.searchString = filterText;
					$scope.events = filteredItems;
				}
			});
		};

		$scope.openEventTypePopover = function(ev) {
			popover.then(function(p) {
				p.show(ev);
			});
		};

		$scope.setEventType = function(type) {
			popover.then(function(p) {
				p.hide();
			});
			if ($scope.eventType !== type) {
				kv.set('cruisemonkey.events.event-type', type).then(function() {
					$scope.eventType = type;
					$scope.doRefresh().then(function() {
						$timeout(function() {
							$scope.goToNow();
						});
					});
				});
			}
		};

		$scope.currentEvents = [];

		$scope.doRefresh = function() {
			if (!$scope.isVisible) {
				return $q.when();
			}

			var now = datetime.moment();
			var currentEvents = [];

			var deferred = $q.defer();
			$scope.$evalAsync(function() {
				var user = UserService.get();
				if (user && user.loggedIn) {
					$scope.eventTypes = ['official', 'shadow', 'all', 'followed'];
				} else {
					$scope.eventTypes = ['official', 'shadow', 'all'];
				}
				if ($scope.eventTypes.indexOf($scope.eventType) < 0) {
					// logged out, maybe it's a hidden type
					$scope.eventType = defaultEventType;
				}
				$scope.user = user;

				var evFunction = EventService.getOfficialEvents;
				switch($scope.eventType) {
					case 'all':
						evFunction = EventService.getAllEvents;
						break;
					case 'shadow':
						evFunction = EventService.getUnofficialEvents;
						break;
					case 'followed':
						evFunction = EventService.getFollowedEvents;
						break;
				}

				// first get the cached version for speed
				evFunction(false).then(function(events) {
					//$log.debug('refresh(): events = ' + angular.toJson(events));
					for (var i=0, len=events.length, e; i < len; i++) {
						e = events[i];
						if (e.matchesDate(now)) {
							currentEvents.push(e.getId());
						}
					}

					$scope.events = withDays(events);
					if (filterBarInstance) {
						filterBarInstance();
					}
					if (firstRefresh) {
						firstRefresh = false;
						$timeout(function() {
							$scope.goToNow();
						}, 500);
					}
					$scope.$broadcast('scroll.refreshComplete');
				}).finally(function() {
					//$log.warn('current events: ' + angular.toJson(currentEvents));
					$scope.currentEvents = currentEvents;
					$ionicLoading.hide();
					deferred.resolve();
				});
			});
			return deferred.promise;
		};

		var _refreshDelayTimeout = null;
		$scope.refreshDelayed = function(delay) {
			$log.debug('CMEventsCtrl.$scope.refreshDelayed()');
			if (_refreshDelayTimeout) {
				return;
			}
			_refreshDelayTimeout = $timeout(function() {
				_refreshDelayTimeout = null;
				$scope.doRefresh();
			}, delay || 300);
		};

		$scope.showFollowed = function(entry) {
			if (!$scope.user.loggedIn) {
				return false;
			}
			return true;
		};
		$scope.showEditable = function(entry) {
			return false;
			/*
			if ($scope.user && $scope.user.username === entry.getUsername() && $scope.user.loggedIn) {
				return true;
			}
			return false;
			*/
		};

		$scope.getCssClass = function(entry) {
			var ret = '';
			if (entry.isOfficial()) {
				ret += ' official';
			} else {
				ret += ' unofficial';
			}
			if (entry.isEven()) {
				ret += ' even';
			} else {
				ret += ' odd';
			}
			/*
			if ($scope.user.username === entry.getUsername()) {
				ret += ' mine';
			}
			*/
			return ret;
		}

		$scope.getDateId = function(date) {
			return 'date-' + date.unix();
		};

		$scope.isDay = function(entry) {
			return entry && entry.day !== undefined;
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

		/** Adding/Editing Events **/

		$scope.addEvent = function(ev) {
			if (ev) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			EditEvent.open();
		};

		$scope.editEvent = function(ev) {
			EditEvent.open(ev);
		};

		$scope.trash = function(ev) {
			$ionicPopup.confirm({
				title: 'Delete Event?',
				template: 'Are you sure you want to delete "' + ev.getSummary() + '"?'
			}).then(function(res) {
				if (res) {
					$scope.events.remove(ev);
					EventService.removeEvent(ev).then(function() {
						$scope.doRefresh();
					});
				} else {
					$log.debug('Canceled delete of ' + ev.getSummary());
				}
			});
		};

		$scope.toggleFollowed = function(ev) {
			var eventId = ev.getId();
			$log.debug('CMEventCtrl.toggleFollowed(' + eventId + ')');

			var username = UserService.getUsername();
			if (ev.isFollowed()) {
				ev.unfollow();
				EventService.unfollow(ev).finally(function() {
					$scope.refreshDelayed(1000);
				});
			} else {
				ev.follow();
				EventService.follow(ev).finally(function() {
					$scope.refreshDelayed(1000);
				});
			}
		};

		$scope.scrollTop = function(ev) {
			if (ev) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			$ionicScrollDelegate.$getByHandle('event-scroll').scrollTop();
		};

		$scope.goToNow = function(ev, animate) {
			if (ev) {
				ev.preventDefault();
				ev.stopPropagation();
			}
			//$timeout(function() {
			$scope.$evalAsync(function() {
				var id, idLocation,
					nextEvent = EventService.getNextEvent($scope.events),
					delegate = $ionicScrollDelegate.$getByHandle('event-scroll');

				if (nextEvent) {
					$log.debug('next event=' + nextEvent.toString());
					for (var i=0, len=$scope.events.length, event; i < len; i++) {
						event = $scope.events[i];
						if (event.getId() === nextEvent.getId() && i > 0 && $scope.events[i-1] instanceof CMDay) {
							$log.debug('event is the first of the day, scrolling to the day marker instead');
							nextEvent = $scope.events[i-1];
							break;
						}
					}

					idLocation = findElementById(nextEvent.getId());
					if (!(nextEvent instanceof CMDay)) {
						$log.debug('event is not the first of the day, giving extra space for the sticky header');
						idLocation = Math.max(0, idLocation - 32);
					}

					$log.debug('scrolling to id location: ' + idLocation);
					delegate.scrollTo(0, idLocation, animate);
				} else {
					delegate.scrollBottom(animate);
				}
			});
		};

		$scope.$on('cruisemonkey.user.updated', $scope.doRefresh);
		$scope.$on('cruisemonkey.notify.eventAdded', $scope.doRefresh);
		$scope.$on('cruisemonkey.notify.eventUpdated', $scope.doRefresh);
		$scope.$on('$ionicView.beforeEnter', function() {
			$scope.isVisible = true;
			if (!$scope.events || $scope.events.length === 0) {
				$ionicLoading.show({
					template: 'Loading...',
					duration: 5000,
					noBackdrop: true
				});
			}
			$scope.doRefresh();
		});
		$scope.$on('$ionicView.afterLeave', function() {
			$scope.isVisible = false;
		});
		$scope.$on('$ionicView.unloaded', function() {
			delete $scope.events;
			delete $scope.users;
		});
	})
	;
}());
