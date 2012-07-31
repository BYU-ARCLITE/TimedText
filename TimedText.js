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
			validators:validators,
			previewers:previewers,
			parsers:parsers
		};
	}
}(window));