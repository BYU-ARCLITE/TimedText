(function(){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
	function Track(cues, kind, label, lang){
		var time = 0,
			mode = "showing",
			activeCues = cues.filter(function(cue){ return cue.startTime <= 0 && cue.endTime >= 0; });
		cues.sort(function(a,b){return (a.startTime - b.startTime) || (b.endTime - a.endTime);});
		this.cues = cues;
		this.language = lang;
		this.label = label;
		this.events = {};
		
		kind = kind.toLowerCase();
		this.kind = TimedText.textPreviewers.hasOwnProperty(kind)?kind:"html";
		
		Object.defineProperties(this,{
			activeCues: { get: function(){ return activeCues; } },
			currentTime: {
				get: function(){ return time; },
				set: function(val){
					var valid, invalid;
					val = +val;
					if(val !== time){
						time = val;
						if(mode !== 'disabled'){
							invalid = activeCues.filter(function(cue){
								return cue.startTime > time || cue.endTime < time;
							});
							valid = this.cues.filter(function(cue){
								return (activeCues.indexOf(cue) === -1) && (cue.startTime <= time && cue.endTime >= time);
							});
							activeCues = activeCues.filter(function(cue){
								return cue.startTime <= time && cue.endTime >= time;
							});
							Array.prototype.push.apply(activeCues,valid);
							if(valid.length || invalid.length){
								this.emit('cues',{ valid: valid, invalid: invalid });
							}
						}
					}
					return time;
				},enumerable: true
			},
			mode: {
				get: function(){ return mode; },
				set: function(val){
					var nmode, match = /^(showing|disabled|hidden)$/.exec(""+val);
					if(match){
						nmode = match[0];
						if(nmode != mode){
							if(nmode === 'disabled'){
								this.emit('cues',{
									invalid: activeCues,
									valid: []
								});
							}else{
								if(mode === 'disabled'){
									this.emit('cues',{
										invalid: [],
										valid: (activeCues = this.cues.filter(function(cue){ return cue.startTime <= time && cue.endTime >= time; }))
									});
								}
								if(nmode === 'hidden'){
									this.emit('hide',activeCues);
								}else if(mode != 'disabled'){
									this.emit('show',activeCues);
								}
							}
							mode = nmode;
						}
					}
					return mode;
				},enumerable: true
			},
			update: {
				value: function(){
					var valid, invalid,
						newcurrent = this.cues.filter(function(cue){ return cue.startTime <= time && cue.endTime >= time; });
					invalid = activeCues.filter(function(cue){ return newcurrent.indexOf(cue) === -1; });
					valid = newcurrent.filter(function(cue){ return activeCues.indexOf(cue) === -1; });
					if(invalid.length || valid.length){
						activeCues = newcurrent;
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
	
	Track.prototype.addCue = function(cue){
		this.cues.push(cue);
		this.cues.sort(function(a,b){return (a.startTime - b.startTime) || (b.endTime - a.endTime);})
		if(this.mode !== 'disabled' && cue.startTime <= this.currentTime && cue.endTime >= this.currentTime){
			this.activeCues.push(cue);
			this.emit('cues',{invalid: [], valid: [cue]});
		}
	};
	
	Track.prototype.removeCue = function(cue){
		var index = this.cues.indexOf(cue);
		if(index === -1){ return; }
		this.cues.splice(index,1);
		if(this.mode !== 'disabled' &&  cue.startTime <= this.currentTime && cue.endTime >= this.currentTime){
			this.activeCues.splice(this.activeCues.indexOf(cue),1);
			this.emit('cues',{invalid: [cue], valid: []});
		}
	};
	
	Track.get = function(params){ //url|file, kind, lang, name
		var source, reader, mime;
		if(params.file instanceof File){
			source = params.file;
			mime = source.type || TimedText.inferType(source.name);
			reader = new FileReader();
			reader.onload = function(evt) {
				params.success(new Track(
					TimedText.parseFile(mime, evt.target.result),
					params.kind,
					typeof params.name === 'string'?params.name:TimedText.removeExt(mime, source.name),
					params.lang
				));
			};
			reader.onerror =	(typeof params.error === 'function')?
								params.error:
								function(e){alert(e.message);};
			reader.readAsText(source);
		}else{
			source = params.url;
			reader = new XMLHttpRequest();
			reader.onreadystatechange = function(){
				if(this.readyState==4){
					if(this.status>=200 && this.status<400){
						mime = this.getResponseHeader('content-type');
						params.success(new Track(
							TimedText.parseFile(mime, this.responseText),
							params.kind,
							typeof params.name === 'string'?params.name:TimedText.removeExt(mime, source.substr(source.lastIndexOf('/'))),
							params.lang
						));
					}else{
						if(typeof params.error === 'function'){ params.error(this); }
						else{ alert("The track could not be loaded: " + this.responseText); }
					}
				}
			};
			reader.open("GET",source,true);
			reader.send();
		}
	};
	
	Track.parse = function(params){ //content, mime, kind, lang, name
		var name = params.name,
			mime = params.mime || TimedText.inferType(name);
		try{
			params.success(new Track(
				TimedText.parseFile(mime, params.content),
				params.kind,
				TimedText.removeExt(mime, name),
				params.lang
			));
		}catch(e){
			if(typeof params.error === 'function'){ params.error(e); }
			else{ alert("The track could not be loaded: " + e.message); }
		}
	};
	
	TimedText.Track = Track;
}());