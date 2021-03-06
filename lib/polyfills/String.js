'use strict';

if (typeof String.prototype.capitalize !== 'function') {
	String.prototype.capitalize = function() {
		return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
	};
}
if (typeof String.prototype.startsWith !== 'function') {
	String.prototype.startsWith = function(str) {
		return this.lastIndexOf(str, 0) === 0;
	};
}
if (typeof String.prototype.endsWith !== 'function') {
	String.prototype.endsWith = function(suffix) {
		return this.indexOf(suffix, this.length - suffix.length) !== -1;
	};
}
if (typeof String.prototype.contains !== 'function') {
	String.prototype.contains = function(comparator) {
		return comparator === undefined || comparator === null? true : this.toLowerCase().indexOf(comparator.toLowerCase()) > -1;
	};
}

String.prototype.decodeHtmlEntities = function() {
	return this.replace(/&#(\d+);/g, function(match, dec) {
		return String.fromCharCode(dec);
	});
};