(function(){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
	function Track(cues, kind, lang, label){
		var time = 0,
			mode = "showing",
			currentCues = cues.filter(function(cue){ return cue.startTime <= 0 && cue.endTime >= 0; });
		this.cues = cues;
		this.lang = lang;
		this.label = label;
		this.events = {};
		
		kind = kind.toLowerCase();
		this.kind = TimedText.textPreviewers.hasOwnProperty(kind)?kind:"html";
		
		Object.defineProperties(this,{
			currentCues: { get: function(){ return this.mode !== 'disabled' ? currentCues : []; } },
			currentTime: {
				get: function(){ return time; },
				set: function(val){
					var valid, invalid;
					val = +val;
					if(val !== time){
						time = val;
						if(mode !== 'disabled'){
							invalid = currentCues.filter(function(cue){
								return cue.startTime > time || cue.endTime < time;
							});
							valid = this.cues.filter(function(cue){
								return (currentCues.indexOf(cue) === -1) && (cue.startTime <= time && cue.endTime >= time);
							});
							currentCues = currentCues.filter(function(cue){
								return cue.startTime <= time && cue.endTime >= time;
							});
							Array.prototype.push.apply(currentCues,valid);
							this.emit('cues',{ valid: valid, invalid: invalid });
						}
					}
					return time;
				},enumerable: true
			},
			mode: {
				get: function(){ return mode; },
				set: function(val){
					var nmode, match = /showing|disabled|hidden/.exec(""+val);
					if(match){
						nmode = match[0];
						if(nmode != mode){
							if(nmode === 'disabled'){
								this.emit('cues',{
									invalid: currentCues,
									valid: []
								});
							}else{
								if(mode === 'disabled'){
									this.emit('cues',{
										invalid: [],
										valid: (currentCues = this.cues.filter(function(cue){ return cue.startTime <= time && cue.endTime >= time; }))
									});
								}
								if(nmode === 'hidden'){
									this.emit('hide',currentCues);
								}else if(mode != 'disabled'){
									this.emit('show',currentCues);
								}
							}
						}
					}
				},enumerable: true
			},
			update: {
				value: function(){
					var valid, invalid,
						newcurrent = this.cues.filter(function(cue){ return cue.startTime <= time && cue.endTime >= time; });
					invalid = currentCues.filter(function(cue){ return newcurrent.indexOf(cue) === -1; });
					valid = newcurrent.filter(function(cue){ return currentCues.indexOf(cue) === -1; });
					if(invalid.length || valid.length){
						currentCues = newcurrent;
						this.emit('cues',{invalid: invalid, valid: valid});
					}
				}, enumerable: true
			}
		});
	}
	
	Track.prototype.emit = function(evt, data){
		var that = this, fns = this.events[evt];
		fns && fns.forEach(function(cb){ cb.call(that,data); });
	};

	Track.prototype.on = function(name, cb){
		if(this.events.hasOwnProperty(name)){ this.events[name].push(cb); }
		else{ this.events[name] = [cb]; }
	};
	
	Track.prototype.add = function(cue){
		this.cues.push(cue);
		this.cues.sort(function(a,b){return (a.startTime - b.startTime) || (b.endTime - a.endTime);})
		if(this.mode !== 'disabled' && cue.startTime <= this.currentTime && cue.endTime >= this.currentTime){
			this.currentCues.push(cue);
			this.emit('cues',{invalid: [], valid: [cue]});
		}
	};
	
	Track.prototype.remove = function(cue){
		var index = this.cues.indexOf(cue);
		if(index === -1){ return; }
		this.cues.splice(index,1);
		if(this.mode !== 'disabled' &&  cue.startTime <= this.currentTime && cue.endTime >= this.currentTime){
			this.currentCues.splice(this.currentCues.indexOf(cue),1);
			this.emit('cues',{invalid: [cue], valid: []});
		}
	};
		
	TimedText.Track = Track;
}());