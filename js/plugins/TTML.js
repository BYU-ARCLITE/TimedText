/*
http://www.w3.org/TR/ttaf1-dfxp/
*/
(function(){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
	var TTMLCue = TimedText.makeCueType(function(){});
	
	function processCueText(text){
		var el = document.createElement('div'),
			dom = document.createDocumentFragment();
		el.innerHTML = text.replace(/\n/g, "<br/>");
		[].slice.call(el.childNodes).forEach(dom.appendChild.bind(dom));
		return dom;
	}
	
	TTMLCue.prototype.getCueAsHTML = function() {
		if(!this.DOM){
			this.DOM = processCueText(this.text);
		}
		return this.DOM.cloneNode(true);
	};
	
	function XMLEncode(s) {
		return s.replace(/\&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|(\r[^\n])|([^\r]\n)/g, "<br/>");
	}
	
	function XMLDecode(s) {
		return s.replace(/^\s+|\s+$/,'').replace(/<br\/>/g, '\n').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
	}
	
	function serialize(cue){
		return cue.text === ""?"":
			'<p begin="' + cue.startTime.toFixed(3)
			+ 's" end="' + cue.endTime.toFixed(3)
			+ 's">' + XMLEncode(cue.text) + "</p>";
	}
	
	function parseTTMLTime(timestamp){
		//TODO: Actually implement TTML timestamp spec
		return parseFloat(timestamp);
	}
	
	function parse(input){
		var DOM = (new DOMParser).parseFromString(input,"application/xml");
		return {
			cueList: [].map.call(DOM.getElementsByTagName('p'),function(p){
				return new TTMLCue(	parseTTMLTime(p.getAttribute('begin')),
									parseTTMLTime(p.getAttribute('end')),
									XMLDecode(p.textContent)	);
			}),
			kind: 'subtitles',
			lang: DOM.documentElement.getAttribute('xml:lang'),
			label: ''
		};
	}	
	
	TimedText.registerType('application/ttml+xml', {
		extension: 'ttml',
		name: 'TTML',
		parse: parse,
		cueType: TTMLCue,
		isCueCompatible: function(cue){ return cue instanceof TTMLCue; },
		serialize: function(track){
			return "<?xml version='1.0' encoding='UTF-8'?>"
				+ "<tt xmlns=\"http://www.w3.org/ns/ttml\" xml:lang=\""+track.language+"\"><body><div>"
				+ [].map.call(track.cues,function(cue){ return serialize(cue); }).join('')
				+ "</div></body></tt>";
		}
	});
}());