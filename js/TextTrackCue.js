(function(global, TimedText){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	//if(!global.TextTrackCue){
		global.TextTrackCue = function(){};
	//}
	
	function makeCue(start, end, text) {
		var wasActive = false,
			that = this,
			events = {
				enter: [function(evt){ if(typeof that.onenter === 'function'){ that.onenter(evt); } }],
				exit: [function(evt){ if(typeof that.onexit === 'function'){ that.onexit(evt); } }]
			};
			
		start = parseFloat(start);
		end = parseFloat(end);
		
		this.track = null;
		this.id = "";
		this.pauseOnExit = false;
		
		Object.defineProperties(this,{
			DOM: { value: null, writable: true },
			addEventListener: {
				value: function(type, listener, useCapture){
					var handlers = events[type];
					if(!handlers){
						handlers = events[type] = [];
					}
					if(handlers.indexOf(listener) === -1){
						handlers.push(listener);
					}
				}
			},
			removeEventListener: {
				value: function(type, listener, useCapture){
					var handlers = events[type]||[],
						idx = handlers.indexOf(listener);
					if(~idx){ handlers.splice(idx,1); }
				}
			},
			dispatchEvent: {
				value: function(evt) {
					(events[evt.type]||[]).forEach(function(listener){ listener(evt); });
				}
			},
			text: {
				set: function(t){
					this.DOM = null;
					text = t;
					return text;
				},
				get: function(){ return text; },
				enumerable: true
			},
			startTime: {
				set: function(val){ return start = parseFloat(val)||0; },
				get: function(){ return start; },
				enumerable: true
			},
			endTime: {
				set: function(val){ return end = parseFloat(val)||0; },
				get: function(){ return end; },
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
	
	TimedText.makeCueType = function(cons){
		var Cue = function(start, end, text){
			makeCue.call(this, start, end, text);
			cons.call(this);
		};
		Cue.prototype = new TextTrackCue(0,0,'');
		return Cue;
	};
}(window,window.TimedText));