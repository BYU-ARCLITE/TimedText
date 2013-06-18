/*
http://www.w3.org/TR/ttaf1-dfxp/
*/
(function(){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
	function XMLEncode(s) {
		return s.replace(/\&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	function serialize(cue){
		return cue.text === ""?"":
			'<p begin="' + cue.startTime.toFixed(3)
			+ 's" end="' + cue.endTime.toFixed(3)
			+ 's">' + XMLEncode(cue.text).replace(/\r\n|\r|\n/g, "<br />") + "</p>";
	}
	
	function parse(input){
		throw new Error("TTML Parsing Not Yet Implemented");
	}	
	
	TimedText.mime_types['application/ttml+xml'] = {
		extension: 'ttml',
		name: 'TTML',
		parseFile: parse,
		serializeTrack: function(data){
			if(!(data instanceof Array)){ data = data.cues; }
			data.sort(function(a,b){
				//sort first by start time, then by length
				return (a.startTime - b.startTime) || (b.endTime - a.endTime);
			});
			//TODO: fix the "lang" attribute
			return "<?xml version='1.0' encoding='UTF-8'?>\
			<tt xmlns=\"http://www.w3.org/ns/ttml\" xml:lang=\"en\"><body><div>"
				+ data.map(function(cue){ return serialize(cue); }).join('')
				+ "</div></body></tt>";
		},
		serializeCue: serialize
	};
}());