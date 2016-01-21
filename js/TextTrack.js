// As defined by http://www.whatwg.org/specs/web-apps/current-work/multipage/video.html

var TextTrack = (function(){
	var textKinds = {
		"subtitles":true,
		"captions":true,
		"descriptions":true,
		"metadata":true,
		"chapters":true
	};

	/*	Subclassing DOMException so we can reliably throw it without browser intervention. This is quite hacky. See SO post:
		http://stackoverflow.com/questions/5136727/manually-artificially-throwing-a-domexception-with-javascript
	*/
	function createDOMException(code,message,name) {
		try {
			//	Deliberately cause a DOMException error
			document.querySelectorAll("div/[]");
		} catch(Error) {
			//	Catch it and subclass it
			var CustomDOMException = function CustomDOMException(code,message,name){
				this.code = code;
				this.message = message;
				this.name = name;
			};
			CustomDOMException.prototype = Error;
			return new CustomDOMException(code,message,name);
		}
	}
		
	function TextTrack(kind,label,language) {
		var internalMode = "disabled",
			currentTime = 0;
			
		// If the kind isn't known, throw DOM syntax error exception
		if(!textKinds.hasOwnProperty(kind)){
			throw createDOMException(12,"DOMException 12: SYNTAX_ERR: You must use a valid kind when creating a TimedTextTrack.","SYNTAX_ERR");
		}
		
		this.cues = new TextTrackCueList(this);
		this.activeCues = new ActiveTextTrackCueList(this.cues,this);
		this.kind = kind || "subtitles";
		this.label = label || "";
		this.language = language || "";
		this.readyState = TextTrack.NONE;
		this.renderer = null;
		this.internalDefault = false;

		Object.defineProperties(this,{
			mode: {
				get: function() { return internalMode; },
				set: function(value) {
					if (!/^(showing|disabled|hidden)$/.exec(value)) {
						throw new Error("Illegal mode value for track: " + value);
					}
					if (value !== internalMode) {
						if(internalMode === 'disabled'){
							internalMode = value;
							this.activeCues.refreshCues();
						}else{ internalMode = value; }
						// Refresh all captions on video
						this.renderer && this.renderer.rebuildCaptions(true);
					}
				}
			},
			currentTime: {
				get: function(){ return currentTime; },
				set: function(val){
					currentTime = val;
					if(this.mode !== 'disabled'){ this.activeCues.refreshCues(); }
				}
			},
			"default": {get: function() { return this.internalDefault; }}
		});
	}
	
	// Define constants for TextTrack.readyState
	TextTrack.NONE = 0;
	TextTrack.LOADING = 1;
	TextTrack.LOADED = 2;
	TextTrack.ERROR = 3;
	
	TextTrack.prototype.onload = function () {};
	TextTrack.prototype.onerror = function() {};
	TextTrack.prototype.oncuechange = function() {};
	TextTrack.prototype.addCue = function(cue) { this.cues.addCue(cue);	};
	TextTrack.prototype.removeCue = function(cue) { this.cues.removeCue(cue); };
	
	TextTrack.parse = function(params){ //content, file name, mime, kind, label, lang
		var track, trackData,
			fname = (typeof(params.fname) === "string" ? params.fname : ""),
			mime = (typeof(params.mime) === "string" && params.mime)?params.mime:TimedText.inferType(fname);
		try{
			trackData = TimedText.parse(mime, params.content);
			track = new TextTrack(
				typeof(params.kind) === "string" ? params.kind : trackData.kind,
				typeof(params.label) === "string" ? params.label : TimedText.removeExt(mime, fname),
				typeof(params.lang) === "string" ? params.lang : trackData.lang
			);
			track.cues.loadCues(trackData.cueList);
			track.readyState = TextTrack.LOADED;
			track.activeCues.refreshCues();
			if(params.success instanceof Function){ setTimeout(params.success.bind(null,track,mime),0); }
		}catch(e){
			if(params.error instanceof Function){ setTimeout(params.error.bind(null,e),0); }
			else{ alert("The track could not be loaded: " + e.message); }
		}
		return track;
	};
	
	TextTrack.get = function(params){ //src, kind, label, lang
		var source = params.src,
			reader, track;
		
		track = new TextTrack(
			typeof params.kind === "string" ? params.kind : "",
			typeof params.label === "string" ? params.label : "",
			typeof params.lang === "string" ? params.lang : ""
		);
		if(typeof params.error === 'function'){ track.onerror = params.error; }
		track.readyState = TextTrack.LOADING;
		
		function load(trackData,mime){
			if(!track.kind){ track.kind = trackData.kind; }
			if(!track.language){ track.language = trackData.language; }
			if(!track.label){ track.label = trackData.label; }
				
			track.cues.loadCues(trackData.cueList);
			track.activeCues.refreshCues();
			track.readyState = TextTrack.LOADED;
			track.onload();
			if(typeof params.success === 'function'){ setTimeout(params.success.bind(null,track,mime),0); }
		}
		
		if(source instanceof File){
			reader = new FileReader();
			reader.onerror = params.error;
			reader.onload = function(evt) {
				var mime = source.type || TimedText.inferType(source.name),
					trackData = TimedText.parse(mime, evt.target.result);
				load(trackData,mime);
				if(!track.label){ track.label = TimedText.removeExt(mime, source.name); }
			};
			reader.readAsText(source);
		}else if(typeof source === "string" || source instanceof String){
			reader = new XMLHttpRequest();
			reader.open('GET', source, true);
			reader.onreadystatechange = function(eventData) {
				var mime, trackData;
				if (this.readyState !== 4) { return; }
				if(this.status !== 200) {
					track.readyState = TextTrack.ERROR;
					track.onerror(new Error());
					return;
				}
				
				mime = this.getResponseHeader('content-type');
				trackData = TimedText.parse(mime,this.responseText);
				load(trackData,mime);
				if(!track.label){ track.label = TimedText.removeExt(mime, source.substr(source.lastIndexOf('/'))); }
			};
			try { reader.send(null); }
			catch(err) {
				track.readyState = TextTrack.ERROR;
				setTimeout(track.onerror.bind(track,err),0);
			}
		}else if(source instanceof Object){
			(function(){
				var fname = source.name,
					mime = (typeof source.mime === "string" && source.mime) || TimedText.inferType(fname),
					trackData = TimedText.parse(mime, source.content || source.data);
				load(trackData, mime);
				if(!track.label){ track.label = TimedText.removeExt(mime, fname); }
			})();
		}
		return track;
	};
	
	return TextTrack;
}());

// Define read-only properties
function TextTrackCueList(track) { this.track = track instanceof TextTrack ? track : null; }
TextTrackCueList.prototype = [];
TextTrackCueList.prototype.toString = function() { return "[TextTrackCueList]"; };
TextTrackCueList.prototype.getCueById = function(cueID) {
	return this.filter(function(currentCue) {
		return currentCue.id === cueID;
	})[0];
};
TextTrackCueList.prototype.loadCues = function(cueData) {
	var track = this.track;
	cueData.forEach(function(cue){ cue.track = track; } );
	[].push.apply(this,cueData);
	this.sort(function(a,b){
		//sort first by start time, then by length
		return (a.startTime - b.startTime) || (b.endTime - a.endTime);
	});
	track.activeCues.refreshCues();
};
TextTrackCueList.prototype.addCue = function(cue) {
	var i,tcue;
	if (cue && cue instanceof TextTrackCue) {
		if (cue.track === this.track || !cue.track) {
			if(~this.indexOf(cue)){ return; }
			cue.track = this.track;
			for(i=0;tcue=this[i];i++){
				if(tcue.startTime > cue.startTime || (tcue.startTime === cue.startTime && tcue.endTime > cue.endTime)){
					break;
				}
			}
			this.splice(i,0,cue);
			if(cue.active){ this.track.activeCues.refreshCues(); }
		} else {
			throw new Error("This cue is associated with a different track!");
		}
	} else {
		throw new Error("The argument is not an instance of TextTrackCue.");
	}
};

TextTrackCueList.prototype.removeCue = function(cue) {
	var i;
	if (cue && cue instanceof TextTrackCue) {
		if (cue.track === this.track) {
			i = this.indexOf(cue);
			if(i === -1){ return; }
			[].splice.call(this,i,1);
			if(cue.active){ this.track.activeCues.refreshCues(); }
			cue.track = null;
		} else {
			throw new Error("This cue is associated with a different track!");
		}
	} else {
		throw new Error("The argument is not an instance of TextTrackCue.");
	}
};

function ActiveTextTrackCueList(textTrackCueList,textTrack){
	this.refreshCues = function(){
		var i, j, cue, endTime = 1/0,
			cueListChanged = false;
			
		for(i = 0, j = 0; cue = textTrackCueList[i]; i++){
			if(j > 0 && cue.startTime > endTime){
				// If we've seen at least one active cue,
				// and this cue starts after some active
				// cue ends, then there can be no more
				// active cues in the ordered list
				break;
			}else if(cue.active){
				cueListChanged |= cue !== this[j];
				endTime = Math.min(endTime,cue.endTime);
				this[j++] = cue;
			}
		}

		this.length = j;
		
		if(cueListChanged && typeof textTrack.oncuechange === 'function'){
			textTrack.oncuechange();
		}
	};	
	this.refreshCues();
};
ActiveTextTrackCueList.prototype = new TextTrackCueList(null);
ActiveTextTrackCueList.prototype.toString = function() { return "[ActiveTextTrackCueList]"; };