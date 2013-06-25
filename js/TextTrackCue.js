var TextTrackCue = (function(){
	
	function TextTrackCue(startTime, endTime, text) {
		var wasActive = false,
			that = this,
			events = {
				enter: [function(evt){ if(typeof that.onenter === 'function'){ that.onenter(evt); } }],
				exit: [function(evt){ if(typeof that.onexit === 'function'){ that.onexit(evt); } }]
			};
		this.track = null;
		this.id = "";
		this.startTime = parseFloat(startTime);
		this.endTime = parseFloat(endTime);
		this.pauseOnExit = false;
		this.DOM = null;
		
		this.addEventListener = function(type, listener, useCapture){
			var handlers = events[type];
			if(!handlers){
				handlers = events[type] = [];
			}
			if(handlers.indexOf(listener) === -1){
				handlers.push(listener);
			}
		};
		this.removeEventListener = function(type, listener, useCapture){
			var handlers = events[type]||[],
				idx = handlers.indexOf(listener);
			if(idx !== -1){ handlers.splice(idx,1); }
		};
		this.dispatchEvent = function(evt) {
			(events[evt.type]||[]).forEach(function(listener){ listener(evt); });
		};
		
		Object.defineProperties(this,{
			text: {
				set: function(t){
					this.DOM = null;
					text = t;
					return text;
				},
				get: function(){ return text; },
				enumerable: true
			},
			active: {
				get: function() {
					var currentTime,
						track = this.track;
					if (	!(track instanceof TextTrack)	||
							track.readyState !== TextTrack.LOADED ||
							track.mode === "disabled"
						){ return false; }
					
					currentTime = track.currentTime;
					if (this.startTime <= currentTime && this.endTime >= currentTime) {
						if (!wasActive) {
							// Fire enter event if we were not active and now are
							wasActive = true;
							this.dispatchEvent({type:'enter',target:this});
						}
					}else if (wasActive) {
						// Fire exit event if we were active and now are not
						wasActive = false;
						this.dispatchEvent({type:'exit',target:this});
					}

					return wasActive;
				}
			}
		});
	};
	
	return TextTrackCue;
}());