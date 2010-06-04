function BuzzConnector() {
	this.localPort = undefined;
}

TwitterConnector.prototype.loadActivities = function(port, probeTag){
	this.localPort = port;
}

//https://mail.google.com/mail/?shva=1#buzz/search/test