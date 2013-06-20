TimedText = (function(){
	"use strict";
	var TimedText,
		mimeexp = /([^\s()<>\[\]@,;:"\/\\?.=]+\/[^\s()<>\[\]@,;:"\/\\?.=]+)(;.*)?/;


	function strip_mime(mime){
		var match = mimeexp.exec(mime);
		if(!match){ throw new Error("Invalid Mime-Type"); }
		return match[1];
	}

	function assert_support(mime){
		mime = strip_mime(mime);
		if(!TimedText.mime_types.hasOwnProperty(mime)){ throw new Error('Unsupported Mime-Type'); }
		return mime;
	}
	
	function getExt(mime){
		return TimedText.mime_types[assert_support(mime)].extension;
	}

	function getTypeName(mime){
		return TimedText.mime_types[assert_support(mime)].name;
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
		return TimedText.mime_types[assert_support(mime)][method](data);
	}
	
	function getPlainText(cue){
		return [].map.call(cue.getCueAsHTML().childNodes,function(n){ return n.textContent; }).join('');
	}

	TimedText = {
		mime_types: {},
		parse: dispatch.bind(null,'parse'),
		serialize: dispatch.bind(null,'serialize'),
		getPlainText: getPlainText,
		isSupported: function(mime){ return this.mime_types.hasOwnProperty(strip_mime(mime)); },
		checkType: assert_support,
		inferType: inferMime,
		getTypeName: getTypeName,
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
	
	return TimedText;
}());