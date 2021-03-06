'use strict';

require('../settings/Service');
require('../twitarr/Service');
require('../user/User');
require('ng-file-model');
require('angular-file-upload');

var popoverUrl = require('ngtemplate!html!./chooser.html');
var template = '<ion-popover-view><ion-header-bar> <h1 class="title">My Popover Title</h1> </ion-header-bar> <ion-content> Hello! </ion-content></ion-popover-view>';

angular.module('cruisemonkey.util.Photo', [
	'angularFileUpload',
	'ngCordova',
	'ng-file-model',
	'cruisemonkey.Config',
	'cruisemonkey.Settings',
	'cruisemonkey.Twitarr',
	'cruisemonkey.user.User'
])
.factory('Photos', function($compile, $cordovaCamera, $document, $ionicPopover, $ionicPopup, $log, $q, $rootScope, $window, FileItem, FileUploader, SettingsService, Twitarr, UserService) {
	var $scope = $rootScope.$new();
	$scope.uploader = new FileUploader();
	$scope.uploader.onProgressAll = function(progress) {
		$log.debug('onProgressAll: ' + angular.toJson(progress));
		if ($scope.deferred) {
			$scope.deferred.notify(progress);
		}
	};

	$ionicPopover.fromTemplateUrl(popoverUrl, {
		scope: $scope
	}).then(function(p) {
		$scope.popover = p;
	});

	var getPhotoId = function(response) {
		if (response) {
			if (response.response && response.response.md5_hash) {
				return response.response.md5_hash;
			} else if (response.md5_hash) {
				return response.md5_hash;
			} else if (response && response.files && response.files[0] && response.files[0].photo) {
				return response.files[0].photo;
			}
		}
		$log.debug('Photos.getPhotoId: unhandled response: ' + angular.toJson(response));
		return undefined;
	};

	var resolveUrl = function(unresolved) {
		var deferred = $q.defer();

		var onError = function(err) {
			$rootScope.$evalAsync(function() {
				$log.error('Photos.resolveUrl: failed: ' + angular.toJson(err));
				deferred.reject(err);
			});
		};

		if (angular.isString(unresolved) && unresolved.startsWith('/')) {
			deferred.resolve('file://' + unresolved);
		} else if (angular.isString(unresolved) && unresolved.startsWith('content:') && $window.FilePath) {
			$window.FilePath.resolveNativePath(unresolved, function(path) {
				var url;
				if (path.toURL) {
					url = path.toURL();
				} else {
					url = path;
				}
				if (url.startsWith('/')) {
					url = 'file://' + url;
				}
				$window.resolveLocalFileSystemURL(url, function(path) {
					$rootScope.$evalAsync(function() {
						deferred.resolve(path.toURL());
					});
				}, onError);
			}, onError);
		} else {
			$window.resolveLocalFileSystemURL(unresolved, function(path) {
				$rootScope.$evalAsync(function() {
					deferred.resolve(path.toURL());
				});
			}, onError);
		}
		deferred.promise.then(function(url) {
			$log.debug('Photos.resolveUrl: ' + unresolved + ' -> ' + url);
		});
		return deferred.promise;
	};

	var doPhoto = function(type) {
		$log.debug('doPhoto(' + type + ')');

		if ($scope.popoverClose) {
			$scope.popoverClose();
		}
		$scope.popover.hide();

		var onError = function(err) {
			$scope.$evalAsync(function() {
				$scope.popover.hide();
				$log.error('Photos.doPhoto.onError: ' + angular.toJson(err));
				if (err !== 'no image selected') {
					$scope.$evalAsync(function() {
						$ionicPopup.alert({
							title: 'Failed',
							template: 'Unable to add photo: ' + angular.toJson(err)
						});
					});
				}
				$scope.deferred.reject(err);
			});
		};

		var postPhoto = function(url) {
			$scope.$evalAsync(function() {
				$log.debug('Photos.doPhoto.postPhoto: ' + url);

				var tw;
				if ($scope.isProfile) {
					tw = Twitarr.postUserPhoto;
				} else {
					tw = Twitarr.postPhoto;
				}

				$scope.deferred.notify(1);
				tw(url).then(function(res) {
					var response = angular.fromJson(res.response);
					$log.debug('Photos.doPhoto.postPhoto: response='+angular.toJson(response));
					var id = getPhotoId(response);
					if (id) {
						$scope.deferred.resolve(id);
					} else {
						$scope.deferred.resolve(response);
					}
					return $scope.deferred.promise;
				},
				onError,
				function(progress) {
					if (progress && progress.loaded && progress.total) {
						$scope.deferred.notify(progress.loaded / progress.total * 100);
					} else {
						$scope.deferred.notify(progress);
					}
				});
			});
		};

		if (type === Camera.PictureSourceType.PHOTOLIBRARY && ionic.Platform.isAndroid() && typeof ImagePicker !== 'undefined') {
			ImagePicker.pick(function success(res) {
				$rootScope.$evalAsync(function() {
					$log.debug('Photos.doPhoto: ImagePicker succeeded: ' + angular.toJson(res));
					return resolveUrl(res.url).then(function(url) {
						return postPhoto(url);
					}, onError);
				});
			}, onError);
		} else {
			var options = {
				correctOrientation: true,
				encodingType: Camera.EncodingType.JPEG,
				destinationType: Camera.DestinationType.FILE_URI,
				mediaType: Camera.MediaType.PICTURE,
				quality: 80,
				saveToPhotoAlbum: type !== Camera.PictureSourceType.PHOTOLIBRARY,
				sourceType: type
			};

			$cordovaCamera.getPicture(options).then(function(results) {
				$log.debug('Photos.doPhoto: getPicture worked: ' + angular.toJson(results));
				if (!results) {
					return onError('Not supported.');
				}
				return resolveUrl(results).then(function(url) {
					return postPhoto(url);
				});
			}, onError);
		}
	};

	$scope.uploadFile = function(image) {
		$log.debug('Photos.uploadFile: ' + image.name);

		$scope.deferred.notify(1);

		var fileName, mimeType, file;
		if (image && image.data) {
			fileName = image.name;
			mimeType = image.type;
			var binary = atob(image.data.split(',')[1]);
			var array = [];
			for (var i=0, len = binary.length; i < len; i++) {
				array.push(binary.charCodeAt(i));
			}
			file = new Blob([new Uint8Array(array)], {type:mimeType});
			file.lastModifiedDate = new Date();

			return SettingsService.getTwitarrRoot().then(function(twitarrRoot) {
				var options = new FileItem($scope.uploader, file);
				if ($scope.isProfile) {
					options.url = twitarrRoot + 'api/v2/user/photo?key=' + UserService.get().key;
				} else {
					options.url = twitarrRoot + 'api/v2/photo?key=' + UserService.get().key;
				}
				//options.removeAfterUpload = true;
				options.onSuccess = function(response) {
					$rootScope.$evalAsync(function() {
						$log.debug('Photos.uploadFile: succeeded: ' + angular.toJson(response));
						var id = getPhotoId(response);
						if (id) {
							$scope.deferred.resolve(id);
						} else {
							$scope.deferred.resolve(response);
						}
					});
				}
				options.onError(function(response) {
					$rootScope.$evalAsync(function() {
						$log.debug('Photos.uploadFile: failed:' + angular.toJson(response));
						$scope.deferred.reject(response);
					});
				});
				options.onCancel(function(response) {
					$rootScope.$evalAsync(function() {
						$log.debug('Photos.uploadFile: canceled: ' + angular.toJson(response));
						$scope.deferred.reject(response);
					});
				});
				options.onProgress(function(progress) {
					if (progress && progress.loaded && progress.total) {
						$scope.deferred.notify(progress.loaded / progress.total * 100);
					} else {
						$scope.deferred.notify(progress);
					}
				});

				$scope.uploader.addToQueue(file, options);
				$scope.uploader.uploadAll();
				return $scope.deferred.promise;
			});
		} else {
			var tw;
			if ($scope.isProfile) {
				tw = Twitarr.postUserPhoto;
			} else {
				tw = Twitarr.postPhoto;
			}

			return tw(image).then(function(res) {
				var response = angular.fromJson(res.response);
				$log.debug('Photos.uploadFile: response='+angular.toJson(response));
				var id = getPhotoId(response);
				if (id) {
					$scope.deferred.resolve(id);
				} else {
					$scope.deferred.resolve(response);
				}
				return $scope.deferred.promise;
			}, function(err) {
				$log.debug('Photos.uploadFile: error: ' + angular.toJson(err));
				$scope.deferred.reject(err);
				return $scope.deferred.promise;
			}, function(progress) {
				if (progress && progress.loaded && progress.total) {
					$scope.deferred.notify(progress.loaded / progress.total * 100);
				} else {
					$scope.deferred.notify(progress);
				}
			});
		}
	};

	$scope.$watch('photo', function(newFile) {
		if (newFile) {
			return $scope.uploadFile(newFile);
		}
	});

	$scope.addPhoto = function(ev) {
		$log.debug('Photos.addPhoto');
		if (ev) {
			ev.preventDefault();
			ev.stopPropagation();
		}
		return doPhoto(Camera.PictureSourceType.PHOTOLIBRARY);
	};

	$scope.takePhoto = function(ev) {
		$log.debug('Photos.takePhoto');
		if (ev) {
			ev.preventDefault();
			ev.stopPropagation();
		}
		return doPhoto(Camera.PictureSourceType.CAMERA);
	};

	$scope.hasNative = function() {
		if (ionic.Platform.isAndroid()) {
			return typeof ImagePicker !== 'undefined';
		} else {
			return navigator.camera && Camera;
		}
	};

	$scope.activate = function(ev, isProfile) {
		$scope.isProfile = !!isProfile;
		$scope.deferred = $q.defer();
		$scope.popoverClose = $scope.$on('popover.hidden', function() {
			if ($scope.popoverClose) {
				$scope.deferred.reject('popover hidden');
				$scope.popoverClose();
				delete $scope.popoverClose;
			}
		});

		$scope.deferred.promise.finally(function() {
			if ($scope.popoverClose) {
				$scope.$evalAsync(function() {
					$scope.popoverClose();
					delete $scope.popoverClose;
				});
			}
			$scope.$evalAsync($scope.popover.hide);
		});

		if ($scope.wrapper) {
			$scope.wrapper.remove();
			delete $scope.wrapper;
		}

		if (ev) {
			ev.preventDefault();
			ev.stopPropagation();
		}
		if ($scope.hasNative()) {
			$log.debug('Photos.activate: native');
			$scope.popover.show(ev);
		} else {
			$log.debug('Photos.activate: browser');
			$scope.wrapper = angular.element('<div style="width: 1px; height: 1px"></div>');
			var el = angular.element('<input type="file" id="photo-upload" accept="image/*;capture=camera" ng-file-model="$parent.photo"></input>');
			$scope.wrapper.append(el);
			angular.element($document[0].body).append($scope.wrapper);

			$compile($scope.wrapper.contents())($scope);

			el.click();
		}

		return $scope.deferred.promise.then(function(ret) {
			return ret;
		}, function(err) {
			$scope.$evalAsync($scope.popover.hide);
		});
	};

	return {
		hasNative: $scope.hasNative,
		activate: $scope.activate
	};
});
