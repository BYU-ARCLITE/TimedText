(function(global){
	"use strict";
	var validators,
		previewers,
		parsers,
		t_el = document.createElement('span'),
		mimeexp = /([^\s()<>\[\]@,;:"\/\\?.=]+\/[^\s()<>\[\]@,;:"\/\\?.=]+)(;.*)?/;

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

	function strip_mime(mime){
		var match = mimeexp.exec(mime);
		if(!match){ throw new Error("Invalid Mime-Type"); }
		return match[1];
	}

	function assert_support(mime){
		mime = strip_mime(mime);
		if(!global.TimedText.mime_types.hasOwnProperty(mime)){ throw new Error('Unsupported Mime-Type'); }
		return mime;
	}
	
	function getExt(mime){
		return global.TimedText.mime_types[assert_support(mime)].extension;
	}
	
	function inferMime(name){
		var mime, ext, mime_table = global.TimedText.mime_types;
		for(mime in mime_table){
			ext = mime_table[mime].extension;
			if(name.substr(name.length-ext.length) === ext){ return mime; }
		}
		return "";
	}
	
	function dispatch(method, mime, data){
		return global.TimedText.mime_types[assert_support(mime)][method](data);
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
			serializeCue: dispatch.bind(null,'serializeCue'),
			isSupported: function(mime){ return this.mime_types.hasOwnProperty(strip_mime(mime)); },
			checkType: assert_support,
			inferType: inferMime,
			getExt: getExt,
			addExt: function(mime,name){
				var suffix = getExt(mime);
				return (name.substr(name.length-suffix.length).toLowerCase() === suffix)?
					name:name+'.'+suffix;
			},
			removeExt: function(mime,name){					
				var suffix = '.'+getExt(mime),
					len = name.length-suffix.length;
				return (name.substr(len).toLowerCase() === suffix)?name.substr(0,len):name;
			}
		};
	}
}(window));