function TwitterConnector() {
	this.localPort = undefined;
}

TwitterConnector.prototype.loadActivities = function(port, probeTag){
	this.localPort = port;
	
	var query = new QueryURL(baseURL, probeTag);
	var url = query.getURL();
	this.loadLongTermTweetsPerMinute(url, probeTag);
	/*
	 * TODO: Needs to be refactored in next version...
	*/
	setTimeout ( function() { 
		this.loadCurrentTweetsPerMinute(url, probeTag)
	}
	, 800);
}

TwitterConnector.prototype.loadLongTermTweetsPerMinute = function(queryURL, probeTag) {
	var timeString = 0;
	var resultNumber = 1000;	
	
	$.getJSON(queryURL + '&rpp=1&page=' + resultNumber, function(data) {
		if(data.results.length == 0) {
			resultNumber = this.setNextResultNumberCount(resultNumber);
			$.getJSON(queryURL + '&rpp=1&page=' + resultNumber, function(data) {
		 		if(data.results.length == 0) {
		 			resultNumber = this.setNextResultNumberCount(resultNumber);
					$.getJSON(queryURL + '&rpp=1&page=' + resultNumber, function(data) {
				   	 	if(data.results.length != 0) {
				   	 		console.log('Puhh finally found tweets for your keyword');
				   	 		this.processLongTermTweets(data, probeTag, resultNumber);
						}
						else {
							this.localPort.postMessage({update:probeTag});
							console.log("Seems like your keyword hasen't been tweeted yet!?");						
						}
					});
				}
				else {
					this.processLongTermTweets(data, probeTag, resultNumber);
				}
			});
		}
		else {
			this.processLongTermTweets(data, probeTag, resultNumber);
		}
	});	
}



TwitterConnector.prototype.setNextResultNumberCount = function(resultNumber) {
	console.log('Less than a ' + resultNumber + ' tweets ever');
	resultNumber = resultNumber / 10;
	console.log('Now checking last: ' + resultNumber + 'results');
	return resultNumber;
}

TwitterConnector.prototype.processLongTermTweets = function(data, probeTag, resultNumber) {
	console.log("Starting processing of long term Tweets...");
	var timeString = data.results[0].created_at;
	probeTag.longTermTweetsPerMin = this.calculateTweetsPerMinute(timeString, resultNumber);
	probeManager.setProbe(probeTag);
	console.log("Finished Long Term procesing.");
	this.localPort.postMessage({update:probeTag});
}

TwitterConnector.prototype.loadCurrentTweetsPerMinute = function(queryURL, probeTag) {
	console.log('Starting loading current tweets per minute...');
	$.getJSON(queryURL + '&rpp=100&page=1', function(data) {
		if(data.results.length > 0) {
			var now = new Date();
			var fiveMinAgo = now.getTime() - (60000 * 5);
			var tweetDate = new Date(data.results[0].created_at);
			
			var index = 0;
			/*
			 * TODO: Replace this with better algorithm then O(n), week could use a binary search like algorithm with O(log n)?
			*/
			while(tweetDate > fiveMinAgo && index < 100) {
				var ts = new Date(data.results[index].created_at);
				tweetDate = ts.getTime();
				index++;

				var diff = tweetDate - fiveMinAgo;
				console.log(index + ' tweets already found' +
							'Tweet Date: ' + ts + 
							' FiveMinAgo: ' + new Date(fiveMinAgo) + 
							' Diff: ' + diff +
							diff < 0 ? 'Termination condition full filled, stop counting' : '');

			}
			var numberOfTweetsWithinOneMinute = index / 5;
			console.log('Current Tweet count per Minute: ' + numberOfTweetsWithinOneMinute);
			if(numberOfTweetsWithinOneMinute >= 20) {
				console.log('Oh, more than 20 Tweets/Minute, switching strategy. Taking last 100 tweets for calculation');
				var timeString = data.results[data.results.length - 1].created_at;
				var tweetsPerMinute = this.calculateTweetsPerMinute(timeString, data.results.length);

				this.updateCurrentTweetsPerMinute(tweetsPerMinute, probeTag);
			}
			else if (numberOfTweetsWithinOneMinute === 0) {
				console.log('No Short term tweets in one minute');
				var watchLastTweets = Math.floor(data.results.length / 10);
				console.log('Try calculating current tweets per Minute with the last ' + watchLastTweets + 'Tweets');
				var timeString = data.results[watchLastTweets].created_at;
				var tweetsPerMinute = calculateTweetsPerMinute(timeString, watchLastTweets);

				this.updateCurrentTweetsPerMinute(tweetsPerMinute, probeTag);
			}
			else {
				this.updateCurrentTweetsPerMinute(numberOfTweetsWithinOneMinute, probeTag);
			}
			probeManager.setProbe(probeTag);
			this.localPort.postMessage({update:probeTag});
		}
		else if(data.results.length === 0){
			probeTag.shortTermTweetsPerMin = 0;
			console.log("Keyword hasen't been tweeted in the last five  minutes");
		}
		else {
			probeTag.shortTermTweetsPerMin = '?';
			console.log('Error in loading tweets from server');
		}
	});	
}

TwitterConnector.prototype.updateCurrentTweetsPerMinute = function(tweetsWithinOneMinute, probeTag) {
	probeTag.shortTermTweetsPerMin = tweetsWithinOneMinute * CORRECTION_FACTOR;
	console.log("Finished Current Term processing");

	

	if(tweetsWithinOneMinute > probeTag.longTermTweetsPerMin * settings.thresholdRatio) {//version 0.1.1
	//if(tweetsWithinOneMinute > probeTag.longTermTweetsPerMin * probeTag.thresholdRatio) { //version 2.0
	//if(tweetsWithinOneMinute > probeTag.longTermTweetsPerMin * ALERT_RATIO) { //version 0.1
		
		/*
		 * do something on new event
		 */
			onNewEvent(probeTag);
		 /*
		  * sent message to popup.html if popup.html is active
		  */
		  if(this.localPort){
			this.localPort.postMessage({alert:probeTag});
		  }
		console.log('Alert >=' + tweetsWithinOneMinute + 'Tweets/Min');
	}
}

TwitterConnector.prototype.calculateTweetsPerMinute = function(timeString, resultCount) {
	console.log('Current tweet was created on: ' + timeString);
	var lastTweet = new Date(timeString);	
	var now = new Date();
	var timeDiffInMS = now - lastTweet;
	console.log('Time difference between now and tweet date in ms: ' + timeDiffInMS);
	var timePerTweetInMS = timeDiffInMS / resultCount + 0.0;
	console.log('Time per tweet in ms: ' + timePerTweetInMS);
	var numberOfTweetsWithinOneMinute = (1000 * 60) / timePerTweetInMS + 0.0;
	console.log('Tweets per minute: ' + numberOfTweetsWithinOneMinute);
	console.log('Rounded Avg of tweets per minute: ' + Math.round(numberOfTweetsWithinOneMinute));
	return numberOfTweetsWithinOneMinute;
}

TwitterConnector.prototype.buildProbeQuery = function(probeObj){
	if(probeObj){
		if (probeObj.radius == undefined){
			return 'http://search.twitter.com/search?q=' + escape(probeObj.query) + '&ands=&phrase=&ors=&nots=&tag=&lang=all&from=&to=&ref=&near=&within=&units=km&since=&until=&rpp=15';
		}else{
			return 'http://search.twitter.com/search?q=' + escape(probeObj.query) + '&ands=&phrase=&ors=&nots=&tag=&lang=all&from=&to=&ref=&near=&within=' + probeObj.radius + '&units=km&since=&until=&rpp=15' + '&geocode=' + escape(probeObj.latitude + ',' + probeObj.longitude + ',' + probeObj.radius + 'km');
		}
	}else{
		return 'about:';
	}
}

