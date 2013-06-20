var TextTrackCue = (function(){
	var allowedDirs = {'':true,'rl':true,'lr':true},
		allowedAlign = {'start':true,'middle':true,'end':true,'left':true,'right':true},
		set_pat = /(align|vertical|line|size|position):(\S+)/g,
		time_pat = /\s*(\d*:?[0-5]\d:[0-5]\d\.\d{3})\s*-->\s*(\d*:?[0-5]\d:[0-5]\d\.\d{3})\s*(.*)/,
		idCounter = 0;
	
	function validate_percentage(value){
		var number = /^\d+%$/.test(value)?parseInt(value,10):+value;
		if((typeof number === 'number') && number>=0 && number<=100){
			return number;
		}
		throw new SyntaxError("Invalid Percentage");
	}
	
	function parse_settings(cue,line){
		var fields;
		set_pat.lastIndex = 0;
		while(!!(fields = set_pat.exec(line))){
			cue[fields[1]] = fields[2];
		}
	}
	
	function TextTrackCue(startTime, endTime, text) {
		var wasActive = false,
			that = this,
			dir = '',
			line = "auto",
			position = 50,
			size = 100,
			align = "middle",
			events = {
				enter: [function(evt){ if(typeof that.onenter === 'function'){ that.onenter(evt); } }],
				exit: [function(evt){ if(typeof that.onexit === 'function'){ that.onexit(evt); } }]
			};
		this.track = null;
		this.id = "";
		this.uid = (idCounter++).toString(36);
		this.startTime = parseFloat(startTime);
		this.endTime = parseFloat(endTime);
		this.pauseOnExit = false;
		this.snapToLines = true;
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
				},
				get: function(){
					return text;
				},
				enumerable: true
			},
			vertical: {
				set: function(value){
					if(allowedDirs.hasOwnProperty(value)){ return (dir = value); }
					throw new SyntaxError("Invalid Writing Direction");
				},get: function(){return dir;},
				enumerable: true
			},
			align: {
				set: function(value){
					if(allowedAlign.hasOwnProperty(value)){ return align=value; }
					throw new SyntaxError("Invalid value for align attribute.");
				},get: function(){return align;},
				enumerable: true
			},
			line: {
				set: function(value){
					var number;
					this.snapToLines=true;
					if(typeof value === 'number'){ return (line = value)+""; }
					if(value==='auto'){ return line='auto'; }
					if(/^-?\d+%?$/.test(value)){
						number = parseInt(value,10);
						if(value[value.length-1] === '%'){	//If the last character in value is %
							if(number<0 || number>100){ throw new SyntaxError("Invalid Percentage"); }
							this.snapToLines = false;
						}
						line = number;
						return value;
					}
					throw new SyntaxError("Invalid Line Position");
				},get: function(){return this.snapToLines?line:(line+"%");},
				enumerable: true
			},
			size: {
				set: function(value){ return size = validate_percentage(value); },
				get: function(){return size;},
				enumerable: true
			},
			position: {
				set: function(value){ return position = validate_percentage(value); },
				get: function(){return position;},
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