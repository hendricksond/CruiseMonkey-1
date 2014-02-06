(function() {
	'use strict';

	angular.module('cruisemonkey.controllers.About', [
		'cruisemonkey.Database',
		'cruisemonkey.Logging',
		'cruisemonkey.Config'
	])
	.controller('CMAboutCtrl', ['$scope', '$rootScope', 'LoggingService', 'config.app.version', function($scope, $rootScope, log, version) {
		log.info('Initializing CMAboutCtrl');
		$rootScope.title = 'About CM4';
		$rootScope.leftButtons = [];
		$rootScope.rightButtons = [];
		$scope.version = version;
		
		$scope.goToSite = function(site) {
			$rootScope.openUrl(site, '_system');
		};
	}]);
}());
