(function(global){
	"use strict";
	var validators,
		previewers,
		parsers,
		t_el = document.createElement('span');
		
	function stripHTML(text){
		t_el.innerHTML = text;
		return t_el.innerText || t_el.textContent || "";
	}
	function stripCueMarkup(text){
		return stripHTML(text);
	}
	function stripTitleMarkup(text){
		return stripHTML(text);
	}
	
	function validateHTML(text){
		return true;
	}
	function validateCue(text){
		return true;
	}
	function validateTitle(text){
		return true;
	}

	function parseHTML(text){
		return text;
	}
	function parseCue(text){
		return parseHTML(text);
	}
	function parseTitle(text){
		return parseHTML(text);
	}
	
	var mimeexp = /([^\s()<>\[\]@,;:"\/\\?.=]+\/[^\s()<>\[\]@,;:"\/\\?.=]+)(;.*)?/;                       
	
	function dispatch(method, mime, data){
		var match = mimeexp.exec(mime);
		if(!match){ throw new Error("Invalid Mime-Type"); }
		mime = match[1];
		if(!global.TimedText.mime_types.hasOwnProperty(mime)){ throw new Error('Unsupported File Type'); }
		return global.TimedText.mime_types[mime][method](data);
	}
	
	if(!global.TimedText){
		//create a preview of the cue content
		previewers = {
			html:			stripHTML,
			subtitles:		stripCueMarkup,
			captions:		stripCueMarkup,
			descriptions:	stripCueMarkup,
			chapters:		stripTitleMarkup,
			metadata:		function(){return "<data>";}
		};
		
		//ensure the cue content has the right form for the track type
		validators = {
			html:			validateHTML,
			subtitles:		validateCue,
			captions:		validateCue,
			descriptions:	validateCue,
			chapters:		validateTitle,
			metadata:		function(){return true;}
		};
		
		//turn cue content into an HTML string, unless it's metadata
		parsers = {
			html:			parseHTML,
			subtitles:		parseCue,
			captions:		parseCue,
			descriptions:	parseCue,
			chapters:		parseTitle,
			metadata:		function(text){return text;}
		};
		
		global.TimedText = {
			textValidators:validators,
			textPreviewers:previewers,
			textParsers:parsers,
			mime_types: {},
			parseFile: dispatch.bind(null,'parseFile'),
			serializeTrack: dispatch.bind(null,'serializeTrack'),
			serializeCue: dispatch.bind(null,'serializeCue')
		};
	}
}(window));