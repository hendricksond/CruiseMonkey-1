describe('cruisemonkey.Events', function() {
	var log          = null;
	var service      = null;
	var userService  = null;
	var db           = null;
	var newdb        = null;
	var $q           = null;
	var $timeout     = null;
	var $rootScope   = null;
	var $httpBackend = null;

	var dbName      = 'cmunittest';
	var async       = new AsyncSpec(this);

	var getEvents = function(results) {
		var ret = {};
		if (!results) {
			return ret;
		}
		angular.forEach(results, function(item) {
			if (item !== undefined && item.getId !== undefined) {
				ret[item.getId()] = item;
			} else {
				console.log('warning: no getId():',item);
			}
		});
		return ret;
	};

	var doDbInit = function(done) {
		newdb.setUserDatabase(userDb);
		newdb.setRemoteDatabase(remoteDb);

		newdb.init().then(function(res) {
			expect(res).toBeGreaterThan(-1);
			done();
		});
	};

	async.beforeEach(function(done) {
		module('cruisemonkey.DB', 'cruisemonkey.Database', 'cruisemonkey.User', 'cruisemonkey.Events', function($provide) {
			$provide.value('config.logging.useStringAppender', true);
			$provide.value('config.database.host', 'localhost');
			$provide.value('config.database.name', dbName);
			$provide.value('config.database.replicate', false);
			$provide.value('config.database.refresh', 20000);
			$provide.value('config.twitarr.root', 'https://twitarr.rylath.net/');
			$provide.value('config.upgrade', false);
		});
		inject(['$log', 'EventService', 'UserService', '_db', 'Database', '$q', '$timeout', '$rootScope', '$httpBackend', function($log, EventService, UserService, _db, Database, q, timeout, scope, backend) {
			log          = $log;
			service      = EventService;
			userService  = UserService;
			db           = Database;
			newdb        = _db;
			$q           = q;
			$timeout     = timeout;
			$rootScope   = scope;
			$httpBackend = backend;

			backend.when('GET', 'http://jccc4.rccl.com/cruisemonkey-jccc4').respond(500, '');
			doDbInit(done);
			$timeout.flush();
		}]);
	});

	describe("#getAllEvents", function() {
		async.it('should return all events', function(done) {
			expect(db).toBeDefined();
			expect(service.getAllEvents).toBeDefined();
			service.getAllEvents().then(function(result) {
				var items = getEvents(result);
				expect(result.length).toEqual(5);
				expect(items).toBeDefined();
				expect(items['official-event']).toBeDefined();
				expect(items['official-event'].getSummary()).toBe('official event');
				done();
			});
		});
	});

	describe("#getOfficialEvents", function() {
		async.it('should return all official events', function(done) {
			userService.save({'loggedIn': true, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.getOfficialEvents).toBeDefined();
			service.getOfficialEvents().then(function(result) {
				expect(result.length).toEqual(1);
				var items = getEvents(result);
				expect(items['official-event']).toBeDefined();
				expect(items['official-event'].getSummary()).toBe('official event');
				expect(items['official-event'].isFavorite()).toBeTruthy();
				done();
			});
		});
	});

	describe("#getUnofficialEvents", function() {
		async.it('should return only the events marked isPublic which are not official', function(done) {
			userService.save({'loggedIn': true, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.getUnofficialEvents).toBeDefined();
			service.getUnofficialEvents().then(function(result) {
				var items = getEvents(result);
				expect(result.length).toEqual(2);
				expect(items['rangerrick-public']).toBeDefined();
				expect(items['triluna-public']).toBeDefined();
				expect(items['rangerrick-public'].isFavorite()).toBeFalsy();
				expect(items['triluna-public'].isFavorite()).toBeFalsy();
				done();
			});
		});
	});

	describe("#getUserEvents", function() {
		async.it('should return only the events for user "rangerrick"', function(done) {
			userService.save({'loggedIn': true, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.getUserEvents).toBeDefined();
			service.getUserEvents().then(function(result) {
				expect(result.length).toEqual(2);
				var items = getEvents(result);
				expect(items['rangerrick-public']).toBeDefined();
				expect(items['rangerrick-public'].isFavorite()).toBeFalsy();
				expect(items['rangerrick-public'].isPublic()).toBeTruthy();
				expect(items['rangerrick-private']).toBeDefined();
				expect(items['rangerrick-private'].isFavorite()).toBeFalsy();
				expect(items['rangerrick-private'].isPublic()).toBeFalsy();
				done();
			});
		});
		async.it('should not return any events if the user is not logged in', function(done) {
			userService.save({'loggedIn': false, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.getUserEvents).toBeDefined();
			service.getUserEvents().then(function(result) {
			}, function(err) {
				expect(err).toBe('EventService.getUserEvent(): user not logged in');
				done();
			});
			$rootScope.$apply();
			$timeout.flush();
		});
	});

	xdescribe("#getMyEvents", function() {
		async.it('should return only the events that user "rangerrick" has created or favorited', function(done) {
			userService.save({'loggedIn': true, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.getMyEvents).toBeDefined();
			service.getMyEvents().then(function(result) {
				expect(result.length).toEqual(4);
				var items = getEvents(result);
				expect(items['1']).toBeDefined();
				expect(items['1'].isFavorite()).toBeTruthy();
				expect(items['2']).toBeDefined();
				expect(items['2'].isFavorite()).toBeFalsy();
				expect(items['3']).toBeDefined();
				expect(items['3'].isFavorite()).toBeTruthy();
				expect(items['4']).toBeDefined();
				expect(items['4'].isFavorite()).toBeFalsy();
				done();
			});
			$rootScope.$apply();
		});
		async.it('should return nothing when the user is not logged in', function(done) {
			userService.save({'loggedIn': false, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.getMyEvents).toBeDefined();
			service.getMyEvents().then(function() {
			}, function(err) {
				expect(err).toBe('EventService.getMyEvents(): user not logged in');
				done();
			});
			$rootScope.$apply();
			$timeout.flush();
		});
	});

	xdescribe('#getMyFavorites', function() {
		async.it('should return a list of favorited ids', function(done) {
			userService.save({'loggedIn': true, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.getMyFavorites).toBeDefined();
			service.getMyFavorites().then(function(result) {
				expect(result.length).toEqual(2);
				var items = getEvents(result);
				expect(items['1']).toBeDefined();
				expect(items['3']).toBeDefined();
				done();
			});
			$rootScope.$apply();
		});
		async.it('should return nothing when the user is not logged in', function(done) {
			userService.save({'loggedIn': false, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.getMyFavorites).toBeDefined();
			service.getMyFavorites().then(function() {
			}, function(err) {
				expect(err).toBe('EventService.getMyFavorites(): user not logged in');
				done();
			});
			$rootScope.$apply();
			$timeout.flush();
		});
	});

	xdescribe('#isFavorite', function() {
		async.it('should return true if the given id is a favorite while rangerrick is logged in', function(done) {
			userService.save({'loggedIn': true, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.isFavorite).toBeDefined();
			service.isFavorite('3').then(function(result) {
				expect(result).toBeTruthy();
				service.isFavorite('2').then(function(result) {
					expect(result).toBeFalsy();
					done();
				});
			});
			$rootScope.$apply();
		});
		async.it('should return false if the given id is a favorite while rangerrick is not logged in', function(done) {
			userService.save({'loggedIn': false, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.isFavorite).toBeDefined();
			service.isFavorite('3').then(function() {
			}, function(err) {
				expect(err).toBe('EventService.isFavorite(): user not logged in');
				done();
			});
			$rootScope.$apply();
			$timeout.flush();
		});
		async.it('should return false if the given id is a favorite of another user', function(done) {
			userService.save({'loggedIn': true, 'username':'bob', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.isFavorite).toBeDefined();
			service.isFavorite('3').then(function(result) {
				expect(result).toBeFalsy();
				done();
			});
			$rootScope.$apply();
		});
	});
	
	xdescribe('#addFavorite', function() {
		async.it('should create a new favorite in the database if ther user is logged in', function(done) {
			userService.save({'loggedIn': true, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.addFavorite).toBeDefined();
			service.addFavorite('1').then(function(result) {
				expect(result).toBeDefined();
				service.isFavorite('1').then(function(result) {
					expect(result).toBeTruthy();
					done();
				});
			});
			$rootScope.$apply();
		});
		async.it('should not create a new favorite in the database if the user is not logged in', function(done) {
			userService.save({'loggedIn': false, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.addFavorite).toBeDefined();
			service.addFavorite('17').then(function(result) {
			}, function(err) {
				expect(err).toBe('EventService.addFavorite(): user not logged in, or no eventId passed');
				done();
			});
			$rootScope.$apply();
			$timeout.flush();
		});
	});

	xdescribe('#removeFavorite', function() {
		async.it('should not remove a favorite from the database if the user is not logged in', function(done) {
			userService.save({'loggedIn': false, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.removeFavorite).toBeDefined();
			service.removeFavorite('3').then(function(result) {
			}, function(err) {
				expect(err).toBe('EventService.removeFavorite(): user not logged in, or no eventId passed');
				done();
			});
			$rootScope.$apply();
			$timeout.flush();
		});
		async.it('should remove a favorite from the database if the user is logged in', function(done) {
			userService.save({'loggedIn': true, 'username':'rangerrick', 'password':'whatever'});
			expect(db).toBeDefined();
			expect(service.removeFavorite).toBeDefined();
			service.removeFavorite('3').then(function(result) {
				expect(result).toBeDefined();
				expect(result).toEqual(1);
				service.isFavorite('3').then(function(result) {
					expect(result).toBeDefined();
					expect(result).toBe(false);
					done();
				});
			});
			$rootScope.$apply();
			$timeout.flush();
		});
	});
	
	xdescribe('#addEvent', function() {
		async.it('should add a new event', function(done) {
			expect(db).toBeDefined();
			expect(service.addEvent).toBeDefined();
			service.addEvent({
				'summary': 'This is a test.',
				'description': 'A TEST, I SAY',
				'username': 'testUser'
			}).then(function(result) {
				expect(result).toBeDefined();
				expect(result.getUsername()).toBeDefined();
				expect(result.getUsername()).toBe('testUser');
				expect(result.getId()).toBeDefined();
				expect(result.getRevision()).toBeDefined();
				done();
			});
			$rootScope.$apply();
		});
	});
	
	xdescribe('#updateEvent', function() {
		async.it('should update an existing event', function(done) {
			expect(db).toBeDefined();
			expect(service.addEvent).toBeDefined();
			expect(service.updateEvent).toBeDefined();
			service.addEvent({
				'summary': 'This is a test.',
				'description': 'A TEST, I SAY',
				'username': 'testUser'
			}).then(function(ev) {
				expect(ev).toBeDefined();
				var oldRevision = ev.getRevision();
				expect(ev.getDescription()).toBe('A TEST, I SAY');
				expect(oldRevision).toBeDefined();
				ev.setDescription('REALLY, A TEST!!');
				service.updateEvent(ev).then (function(modified) {
					expect(modified.getUsername()).toBeDefined();
					expect(modified.getUsername()).toBe('testUser');
					expect(modified.getId()).toBeDefined();
					expect(modified.getRevision()).toBeDefined();
					expect(modified.getRevision()).not.toBe(oldRevision);
					expect(modified.getDescription()).toBe('REALLY, A TEST!!');
					done();
				});
			});
			$rootScope.$apply();
		});
	});
	
	xdescribe('#removeEvent', function() {
		async.it('should remove an existing event', function(done) {
			expect(db).toBeDefined();
			expect(service.addEvent).toBeDefined();
			service.getAllEvents().then(function(result) {
				expect(result.length).toEqual(4);

				var items = getEvents(result);

				var existingId = '1';
				var existingRev = parseInt(items['1'].getRevision().split('-')[0]);
				expect(existingRev).toBeGreaterThan(0);
				service.removeEvent(items['1']).then(function(result) {
					expect(result.ok).toBeDefined();
					expect(result.ok).toBeTruthy();
					expect(result.id).toBe('1');
					expect(result.rev).toBeDefined();
					
					var newRev = parseInt(result.rev.split('-')[0]);
					expect(newRev).toBe(existingRev + 1);

					done();
				});
			});
			$rootScope.$apply();
		});
	});
	
	xdescribe('CMEvent#toEditableBean', function() {
		async.it('should create a bean that matches the event data', function(done) {
			var ev = new CMEvent();
			ev.setId('1');
			ev.setRevision('12345');
			ev.setSummary('foo');
			ev.setDescription('bar');
			ev.setStartString('2010-01-01 00:00');
			ev.setEndString('2010-01-02 00:00');
			ev.setUsername('ranger');
			ev.setLocation('here');
			ev.setPublic(false);

			var bean = ev.toEditableBean();
			expect(bean.id).toBe('1');
			expect(bean.revision).toBe('12345');
			expect(bean.summary).toBe('foo');
			expect(bean.description).toBe('bar');
			expect(bean.startDate).toBe('2010-01-01 00:00');
			expect(bean.endDate).toBe('2010-01-02 00:00');
			expect(bean.location).toBe('here');
			expect(bean.isPublic).toBe(false);

			ev.setStart(moment('2010-01-01 00:00'));
			ev.setEnd(moment('2010-01-01 01:00'));

			bean = ev.toEditableBean();
			expect(bean.startDate).toBe('2010-01-01 00:00');
			expect(bean.endDate).toBe('2010-01-01 01:00');

			done();
		});
	});

	xdescribe('CMEvent#fromEditableBean', function() {
		async.it('should update the event to have matching bean data', function(done) {
			var ev = new CMEvent();
			ev.setId('2');
			ev.setRevision('23456');
			ev.setSummary('foo2');
			ev.setDescription('bar2');
			ev.setStartString('2010-02-01 00:00');
			ev.setEndString('2010-02-02 00:00');
			ev.setUsername('ranger');
			ev.setLocation('there');
			ev.setPublic(true);
			
			ev.fromEditableBean({
				id: '1',
				revision: '12345',
				summary: 'foo',
				description: 'bar',
				startDate: '2010-01-01 00:00',
				endDate: '2010-01-02 00:00',
				location: 'here',
				isPublic: false
			});

			expect(ev.getId()).toBe('1');
			expect(ev.getRevision()).toBe('12345');
			expect(ev.getSummary()).toBe('foo');
			expect(ev.getDescription()).toBe('bar');
			expect(ev.getStartString()).toBe('2010-01-01 00:00');
			expect(ev.getEndString()).toBe('2010-01-02 00:00');
			expect(ev.getUsername()).toBe('ranger');
			expect(ev.getLocation()).toBe('here');
			expect(ev.isPublic()).toBe(false);

			done();
		});
	});
});
