(function() {
	'use strict';

	var datetime = require('../util/datetime'),
		model = require('../data/Model'),
		CMDay = model.CMDay,
		CMEvent = model.CMEvent;

	require('angular-uuid4');

	angular.module('cruisemonkey.Events', [
		'uuid4',
		'cruisemonkey.Config',
		'cruisemonkey.DB',
		'cruisemonkey.user.User'
	])
	.factory('EventService', function($log, $q, $rootScope, db, kv, Twitarr, UserService) {
		var scope = $rootScope.$new();

		var eventdb = db.collection('events', 'events', {transactional:true});
		var ready = $q.defer();
		ready.resolve(eventdb);

		var wipeDatabase = function() {
			$log.info('EventService: wiping event cache.');
			return eventdb.then(function(events) {
				events.removeDataOnly();
				return true;
			});
		};

		scope.$on('cruisemonkey.wipe-cache', function() {
			return wipeDatabase();
		});

		scope.$on('cruisemonkey.user.settings-changed', function(ev, changed) {
			if (changed.old['twitarr.root'] !== changed.new['twitarr.root']) {
				wipeDatabase();
			}
		});

		scope.$on('cruisemonkey.user.updated', function(ev, user) {
			ready = $q.defer();
			return kv.get('cruisemonkey.events.last-user').then(function(lastUser) {
				if (lastUser && (lastUser.username !== user.username || lastUser.loggedIn !== user.loggedIn)) {
					// User has changed enough that the event cache is not trustworthy.  Clear it.
					$log.info('User info has changed.  Clearing event database.');
					return wipeDatabase().then(function() {
						return kv.set('cruisemonkey.events.last-user', user);
					});
				} else {
					return kv.set('cruisemonkey.events.last-user', user);
				}
			}).finally(function() {
				ready.resolve(eventdb);
			});
		});

		var sortEvent = function(a,b) {
			if (a === null) {
				if (b === null) {
					return 0;
				} else {
					return -1;
				}
			} else if (b === undefined) {
				return 1;
			}

			var attrA = a.getStart(),
				attrB = b.getStart();

			if (attrA === undefined) {
				//$log.warn('event start is undefined: ' + a.toString());
				if (attrB === undefined) {
					//$log.warn('BOTH event starts are undefined: ' + a.toString() + ' / ' + b.toString());
					return 0;
				} else {
					return -1;
				}
			} else if (attrB === undefined) {
				return 1;
			}

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

			if (attrA === undefined) {
				//$log.warn('event end is undefined: ' + a.toString());
				if (attrB === undefined) {
					//$log.warn('BOTH event ends are undefined: ' + a.toString() + ' / ' + b.toString());
					return 0;
				} else {
					return -1;
				}
			} else if (attrB === undefined) {
				return 1;
			}

			if (attrA.isBefore(attrB)) { return -1; }
			if (attrA.isAfter(attrB)) { return 1; }

			return 0;
		};

		var updateEvent = function(to, from) {

		};

		var getEvents = function() {
			$log.debug('EventService.getEvents()');
			return ready.promise.then(function(evdb) {
				return Twitarr.getEvents().then(function(events) {
					var seen = {};
					for (var i=0, len=events.length, event, existing; i < len; i++) {
						event = events[i];
						seen[event.id]++;
						event.lastUpdated = CMEvent._stringifyDate(datetime.create());
						existing = evdb.findObject({id:event.id});
						if (existing) {
							event.$loki = existing.$loki;
							event.meta = existing.meta;
							evdb.update(event);
							events[i] = event;
						} else {
							evdb.insert(event);
						}
					}
					evdb.removeWhere(function(e) {
						return !seen[e.id];
					});
					//$log.debug('Got events: ' + angular.toJson(events));
					return events;
				});
			});
		};

		var doCachedQuery = function(where) {
			return ready.promise.then(function(evdb) {
				return evdb.where(where).map(function(event) {
					return new CMEvent(event);
				}).sort(sortEvent);
			}, function(err) {
				$log.error('doCachedQuery: unable to get events from cache: ' + angular.toJson(err));
				return $q.reject(err);
			});
		};

		var doQuery = function(where) {
			return getEvents().then(function(events) {
				return events.filter(where).map(function(event) {
					return new CMEvent(event);
				}).sort(sortEvent);
			}, function(err) {
				$log.debug('doQuery: getEvents() failed, falling back to cache: ' + angular.toJson(err));
				return doCachedQuery(where);
			});
		};

		var getAllEvents = function(cached) {
			var query = function AllEvents() {
				return true;
			};
			return cached? doCachedQuery(query) : doQuery(query);
		};

		var getOfficialEvents = function(cached) {
			var query = function OfficialEvents(ev) {
				return ev.official;
			};
			return cached? doCachedQuery(query) : doQuery(query);
		};

		var getUnofficialEvents = function(cached) {
			var user = UserService.get();
			var query = function ShadowEvents(ev) {
				return !ev.official;
			};
			return cached? doCachedQuery(query) : doQuery(query);
		};

		var getUserEvents = function(cached) {
			var user = UserService.get();
			if (!user.loggedIn) {
				return $q.reject('User is not logged in!');
			}
			var query = function UserEvents(ev) {
				return ev.author === user.username;
			};
			return cached? doCachedQuery(query) : doQuery(query);
		};


		var getFollowedEvents = function(cached) {
			var user = UserService.get();
			if (!user.loggedIn) {
				return $q.reject('User is not logged in!');
			}
			var query = function FollowedEvents(ev) {
				return !!ev.following;
			};
			return cached? doCachedQuery(query) : doQuery(query);
		};

		var addEvent = function(event) {
			return Twitarr.addEvent(event.getRawData()).then(function(ret) {
				$log.debug('EventService.addEvent: success: ' + angular.toJson(ret));
				return ret;
			}, function(err) {
				$log.debug('EventService.addEvent: failed: ' + angular.toJson(err));
				return $q.reject(err);
			});
		};

		var updateEvent = function(event) {
			return Twitarr.updateEvent(event.getRawData()).then(function(ret) {
				$log.debug('EventService.updateEvent: success: ' + angular.toJson(ret));
				return ret;
			}, function(err) {
				$log.debug('EventService.updateEvent: failed: ' + angular.toJson(err));
				return $q.reject(err);
			});
		};

		var removeEvent = function(event) {
			return Twitarr.removeEvent(event.getId()).then(function(ret) {
				$log.debug('EventService.removeEvent: success: ' + angular.toJson(ret));
				return ret;
			}, function(err) {
				$log.debug('EventService.removeEvent: failed: ' + angular.toJson(err));
				return $q.reject(err);
			});
		};

		var follow = function(event) {
			return Twitarr.followEvent(event.getId()).then(function(ret) {
				$log.debug('EventService.follow: success: ' + angular.toJson(ret));
				return ret;
			}, function(err) {
				$log.debug('EventService.follow: failed: ' + angular.toJson(err));
				return $q.reject(err);
			});
		};

		var unfollow = function(event) {
			return Twitarr.unfollowEvent(event.getId()).then(function(ret) {
				$log.debug('EventService.unfollow: success: ' + angular.toJson(ret));
				return ret;
			}, function(err) {
				$log.debug('EventService.unfollow: failed: ' + angular.toJson(err));
				return $q.reject(err);
			});
		};

		var getEventForTime = function(time, eventList) {
			var now = datetime.create(time).unix(),
				matched = -1,
				nextEntry,
				j,
				start, end;

			//$log.debug('now = ' + now);
			if (eventList && eventList.length > 0) {
				for (var i = 0, len=eventList.length, entry; i < len; i++) {
					entry = eventList[i];
					if (entry instanceof CMDay) {
						// skip day markers, we'll fix them at the end anyways
						continue;
					} else {
						// this is an event
						start = entry.getStart().unix();
						end = entry.getEnd() === undefined ? start : entry.getEnd().unix();
						if (end - start > 43200) {
							end = start + 43200;
						}

						//$log.debug('now=' + now + ',start=' + start + ',end=' + end + ': ' + entry.getSummary());
						if (now < start) {
							// we're still before the current event
							//$log.debug(i + ': now < start: inexact match');
							matched = i;
							break;
						} else {
							// we're after the start of the current event

							if (now <= end) {
								// we're in the event, match!
								//$log.debug(i + ': now <= end: exact match');
								matched = i;
								break;
							} else {
								j = i + 1;
								nextEntry = eventList[j];
								while (nextEntry) {
									//$log.debug(j + '/' + len + ': nextEntry = ' + nextEntry);
									if (nextEntry instanceof CMDay) {
										// next entry is a day marker, skip it
										nextEntry = eventList[j++];
										continue;
									} else {
										start = nextEntry.getStart().unix();
										end = nextEntry.getEnd() === undefined ? start : nextEntry.getEnd().unix();
										j = len;
									}

									// the next entry is after now, we'll consider it the best match
									if (now <= start) {
										//$log.debug(j + ': now > end: inexact match');
										matched = j;
										break;
									}
									nextEntry = eventList[j++];
								}
							}
						}
					}
				}

				//$log.debug('matched = ' + matched);
				entry = undefined;
				if (matched > -1) {
					entry = eventList[matched];
					$log.debug('matched ' + entry.getId());
				}

				if (matched === -1) {
					return undefined;
				}

				/*
				if (entry instanceof CMEvent && matched > 0 && eventList[matched - 1] instanceof CMDay) {
					$log.debug('entry ' + entry.getId() + ' was the first of the day, scrolling to the day marker instead.');
					entry = eventList[matched - 1];
				}
				*/
				return entry;
			} else {
				// no events, return nothing
				return undefined;
			}
		};

		return {
			addEvent: addEvent,
			updateEvent: updateEvent,
			removeEvent: removeEvent,
			getAllEvents: getAllEvents,
			getOfficialEvents: getOfficialEvents,
			getUnofficialEvents: getUnofficialEvents,
			getUserEvents: getUserEvents,
			getFollowedEvents: getFollowedEvents,
			follow: follow,
			unfollow: unfollow,
			getEventForTime: getEventForTime,
			getNextEvent: function(events) { return getEventForTime(datetime.create(), events); },
			wipeDatabase: wipeDatabase
		};
	})
	;

}());
