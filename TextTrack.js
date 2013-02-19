// As defined by http://www.whatwg.org/specs/web-apps/current-work/multipage/video.html

var TextTrack = (function(){
	var textKinds = {
		// WHATWG SPEC
		"subtitles":true,
		"captions":true,
		"descriptions":true,
		"metadata":true,
		"chapters":true,
		 // CAPTIONATOR TEXT EXTENSIONS
		"karaoke":true,
		"lyrics":true,
		"tickertext":true
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
	// mutableTextTrack.addCue(cue)
	// Adds the given cue to mutableTextTrack's text track list of cues.
	// Raises an exception if the argument is null, associated with another text track, or already in the list of cues.
	TextTrack.prototype.addCue = function(cue) { this.cues.addCue(cue);	};
	// mutableTextTrack.removeCue(cue)
	// Removes the given cue from mutableTextTrack's text track list of cues.
	// Raises an exception if the argument is null or not in the list of cues.
	TextTrack.prototype.removeCue = function(cue) { this.cues.removeCue(cue); };
	TextTrack.prototype.loadTrack = (function(){
		function loadTrackReadyState(trackElement, callback, eventData) {
			if (this.readyState === 4) {
				if(this.status === 200) {
					trackElement.readyState = TextTrack.LOADED;
					trackElement.cues.loadCues(TimedText.parseFile(this.getResponseHeader('content-type'),this.responseText));
					trackElement.activeCues.refreshCues.apply(trackElement.activeCues);
					trackElement.renderer && trackElement.renderer.rebuildCaptions(true);
					trackElement.onload.call(this);
				
					(callback instanceof Function) && callback.call(trackElement);
				} else {
					// Throw error handler, if defined
					trackElement.readyState = TextTrack.ERROR;
					trackElement.onerror();
				}
			}
		}
		return function(source, callback) {
			//TODO: handle a SourceElement list
			var ajaxObject = new XMLHttpRequest();
			this.readyState = TextTrack.LOADING;
			ajaxObject.open('GET', source, true);
			ajaxObject.onreadystatechange = loadTrackReadyState.bind(ajaxObject, this, callback);
			try { ajaxObject.send(null); }
			catch(err) {
				// Throw error handler, if defined
				this.readyState = TextTrack.ERROR;
				this.onerror(err);
			}
		};
	}());
	
	TextTrack.get = function(params){ //url|file, kind, label, lang
		var source, reader, track, mime;
		if(params.file instanceof File){
			source = params.file;
			mime = source.type || TimedText.inferType(source.name);
			reader = new FileReader();
			reader.onload = function(evt) {
				track = new TextTrack(
					typeof(params.kind) === "string" ? params.kind : "",
					typeof(params.label) === "string" ? typeof params.label : TimedText.removeExt(mime, source.name),
					typeof(params.lang) === "string" ? params.lang : ""
				);
				track.readyState = TextTrack.LOADED;
				track.cues.loadCues(TimedText.parseFile(mime, evt.target.result));
				track.activeCues.refreshCues.apply(track.activeCues);
				(params.success instanceof Function) && params.success.call(track);
			};
			reader.onerror =	(params.error instanceof Function)?
								params.error:
								function(e){alert(e.message);};
			reader.readAsText(source);
		}else{
			source = params.url;
			track = new TextTrack(
				typeof(params.kind) === "string" ? params.kind : "",
				typeof(params.label) === "string" ? params.label : TimedText.removeExt(mime, source.substr(source.lastIndexOf('/'))),
				typeof(params.lang) === "string" ? params.lang : ""
			);
			if(params.error instanceof Function){ track.onerror = params.error; }
			track.loadTrack(source,params.success);
		}
	};
	
	TextTrack.parse = function(params){ //content, mime, kind, label, lang
		var track, name = params.label,
			mime = (typeof(params.mime) === "string" && params.mime.length)?params.mime:TimedText.inferType(name);
		try{
			track = new TextTrack(
				typeof(params.kind) === "string" ? params.kind : "",
				TimedText.removeExt(mime, name),
				typeof(params.lang) === "string" ? params.lang : ""
			);
			track.readyState = TextTrack.LOADED;
			track.cues.loadCues(TimedText.parseFile(mime, params.content));
			track.activeCues.refreshCues.apply(track.activeCues);
			(params.success instanceof Function) && params.success.call(track);
		}catch(e){
			if(params.error instanceof Function){ params.error(e); }
			else{ alert("The track could not be loaded: " + e.message); }
		}
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
	track.activeCues.refreshCues();
};
TextTrackCueList.prototype.addCue = function(cue) {
	if (cue && cue instanceof TextTrackCue) {
		if (cue.track === this.track || !cue.track) {
			// TODO: Sort cue list based on TextTrackCue.startTime.
			if(this.indexOf(cue) !== -1){ return; }
			cue.track = this.track;
			this.push(cue);
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

function ActiveTextTrackCueList(textTrackCueList,textTrack) {
	// Among active cues:

	// The text track cues of a media element's text tracks are ordered relative to each
	// other in the text track cue order, which is determined as follows: first group the
	// cues by their text track, with the groups being sorted in the same order as their
	// text tracks appear in the media element's list of text tracks; then, within each
	// group, cues must be sorted by their start time, earliest first; then, any cues with
	// the same start time must be sorted by their end time, earliest first; and finally,
	// any cues with identical end times must be sorted in the order they were created (so
	// e.g. for cues from a WebVTT file, that would be the order in which the cues were
	// listed in the file).

	this.refreshCues = function() {
		if (!textTrackCueList.length) { return; }
		var cueList = this,
			oldCueList = this.slice(0),
			cueListChanged = false;
			
		this.length = 0;
		textTrackCueList.forEach(function(cue) {
			if (cue.active) {
				cueList.push(cue);
				cueListChanged |= (cue !== oldCueList[cueList.length-1]);
			}
		});

		try { cueListChanged && textTrack.oncuechange(); }
		catch(error) {}
	};	
	this.refreshCues();
};
ActiveTextTrackCueList.prototype = new TextTrackCueList(null);
ActiveTextTrackCueList.prototype.toString = function() { return "[ActiveTextTrackCueList]"; };