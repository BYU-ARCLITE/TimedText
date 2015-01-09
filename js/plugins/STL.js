// https://documentation.apple.com/en/dvdstudiopro/usermanual/index.html#chapter=19%26section=13%26tasks=true
(function(TimedText){
	"use strict";

	if(!TimedText){ throw new Error("TimedText not defined."); }

	var timePat = /(\d\d+):([0-5]\d):([0-5]\d):(\d\d)/;
	var cuePat = /(\S+)\s*,\s*(\S+)\s*,\s?\t*(.*)/;
	var setPat = /\$(\S+)\s*=\s*(\S+)/;
	var linePat = /^(\s*\S.+?)\s*$/gm;
	var commandParsers = {
		/**Cue Text Controls**/
		FontName: parseStr,
		FontSize: parseNum,
		TextContrast: parseNum,
		BackgroundContrast: parseNum,
		/**Cue Display Controls**/
		HorzAlign: parseHorz,
		VertAlign: parseVert,
		XOffset: parseNum,
		YOffset: parseNum,
		FadeIn: parseNum,
		FadeOut: parseNum,
		/**Parser State Controls**/
		Bold: parseBool,
		Italic: parseBool,
		Underlined: parseBool,
		SetFilePathToken: parseStr
	};
	var cueProperties = [
		"Bold",
		"Italic",
		"Underlined",
		"FontName",
		"FontSize",
		"TextContrast",
		"BackgroundContrast",
		"HorzAlign",
		"VertAlign",
		"XOffset",
		"YOffset",
		"FadeIn",
		"FadeOut"
	];

/**
	Parser Controls:
	$SetFilePathToken

	Ignored:
	$ColorIndex1
	$ColorIndex2
	$ColorIndex3
	$ColorIndex4
	$Outline1Contrast
	$Outline2Contrast
	$ForceDisplay
	$TapeOffset
**/

	var STLCue = TimedText.makeCueType(function(){
		var fontName = "",
			fontSize = 0,
			textContrast = 15,
			backgroundContrast = 0,
			horzAlign = "center",
			vertAlign = "bottom",
			xOffset = 0,
			yOffset = 0,
			fadeIn = 0,
			fadeOut = 0;

		Object.defineProperties(this,{
			Bold: {
				get: function(){ return /^(\^[IU])*\^B/.test(this.text); },
				set: function(v){
					var b = this.Bold;
					if(!!v && b){ this.text = '^B'+this.text; }
					else if(!v && !b){ this.text = this.text.replace(/^((\^[IU])*)\^B/,"$1"); }
					return this.Bold;
				}
			},
			Italic: {
				get: function(){ return /^(\^[BU])*\^I/.test(this.text); },
				set: function(v){
					var i = this.Italic;
					if(!!v && i){ this.text = '^I'+this.text; }
					else if(!v && !i){ this.text = this.text.replace(/^((\^[BU])*)\^I/,"$1"); }
					return this.Italic;
				}
			},
			Underlined: {
				get: function(){ return /^(\^[BI])*\^U/.test(this.text); },
				set: function(v){
					var u = this.Underlined;
					if(!!v && u){ this.text = '^U'+this.text; }
					else if(!v && !u){ this.text = this.text.replace(/^((\^[BI])*)\^U/,"$1"); }
					return this.Underlined;
				}
			},
			FontName: {
				get: function(){ return fontName; },
				set: function(v){
					this.DOM = null;
					return fontName = ""+v;
				}
			},
			FontSize: {
				get: function(){ return fontSize; },
				set: function(v){
					this.DOM = null;
					return fontSize = +v||0;
				}
			},
			TextContrast: {
				get: function(){ return textContrast; },
				set: function(v){
					this.DOM = null;
					return textContrast = Math.max(Math.min(+v||0,15),0);
				}
			},
			BackgroundContrast: {
				get: function(){ return backgroundContrast; },
				set: function(v){
					this.DOM = null;
					return backgroundContrast = Math.max(Math.min(+v||0,15),0);
				}
			},
			FadeIn: {
				get: function(){ return fadeIn; },
				set: function(v){ return fadeIn = Math.max(+v||0,0); }
			},
			FadeOut: {
				get: function(){ return fadeOut; },
				set: function(v){ return fadeOut = Math.max(+v||0,0); }
			},
			XOffset: {
				get: function(){ return xOffset; },
				set: function(v){ return xOffset = Math.round(+v||0); }
			},
			YOffset: {
				get: function(){ return yOffset; },
				set: function(v){ return yOffset = Math.round(+v||0); }
			},
			HorzAlign: {
				get: function(){ return horzAlign; },
				set: function(v){
					v = String(v).toLowerCase();
					if(['left','right','center'].indexOf(v) > -1){
						horzAlign = v;
					}
					return horzAlign;
				}
			},
			VertAlign: {
				get: function(){ return vertAlign; },
				set: function(v){
					v = String(v).toLowerCase();
					if(['top','bottom','center'].indexOf(v) > -1){
						vertAlign = v;
					}
					return vertAlign;
				}
			}
		});
	});

	STLCue.prototype.getCueAsHTML = function(){
		if(!this.DOM){
			this.DOM = processCueText(this.text);
			this.DOM.style.opacity = ""+(1 - cue.TextContrast/15);
			this.DOM.style.background = "rgba(0,0,0,"+(1 - cue.BackgroundContrast/15)+")";
			if(cue.FontName !== ""){
				this.DOM.style.fontFamily = cue.FontName;
			}
			if(cue.FontSize !== 0){
				this.DOM.style.fontSize = cue.FontSize.toString(10)+"pt";
			}
		}
		return this.DOM.cloneNode(true);
	};

	/**Text Manipulation Functions**/

	//Ensures that text style control codes occur in a strictly nested order, for easy conversion to HTML
	function normTextControls(text){
		var c, code, idx, tmp, len,
			i = 0, p = 0,
			stack = [], output = [];

		//strip trailing tags, for efficiency
		text = text.replace(/(\^[BIU])+$/,"");
		len = text.length;

		function output_code(code){
			if(output[output.length-1]!== code){ output.push(code); }
			else{ output.length--; }
		}

		main: while(i < len){
			while(text[i] !== '^'){
				if(++i > len){ break main; }
			}
			c = text[++i];
			switch(c){
			case 'B':
			case 'I':
			case 'U':
				if(p < i-1){ output.push(text.substring(p,i-1)); }
				p = ++i
				code = '^'+c;
				if(stack[stack.length-1] === code){
					output_code(code);
					stack.length--;
				}else{
					idx = stack.indexOf(code);
					if(idx === -1){
						output_code(code);
						stack.push(code);
					}else{
						tmp = stack.slice(idx+1,stack.length);
						tmp.reverse().forEach(output_code); //Insert turn-off codes for the other "on" controls
						output_code(code); //Turn the current control off
						stack.splice(idx,1); //And remove it from the "on" stack
						tmp.reverse().forEach(output_code); //Turn the other controls back on again
					}
				}
			}
		}
		return output.join('')+text.substring(p);
	}

	//turns purely-nested STL control code text into minimized on-off control code text
	function minimizeSTLText(text){
		var len, nlen;
		do{ len = text.length;
			text = text.replace(/\^B((\^[IU])*)\^B/,"$1");
			text = text.replace(/\^I((\^[BU])*)\^I/,"$1");
			text = text.replace(/\^U((\^[BI])*)\^U/,"$1");
			nlen = text.length;
		}while(nlen < len);
		return text.replace(/(\^[BIU])+$/,"")
	}

	/**HTML Manipulation Functions**/

	//strip out any html that could not have been generated from STL
	function formatHTML(node) {
		var tag, frag;
		if(node.nodeType === Node.TEXT_NODE){
			return /\^[BIU]/.test(node.textValue)?
				document.createTextNode(node.textValue.replace(/\^[BIU]|\|/g,"")):
				node.cloneNode(false);
		}else if(node.nodeType === Node.ELEMENT_NODE){
			tag = node.nodeName;
			switch(tag){
			case "BR": return node.cloneNode(false);
			case "U": case "B": case "I":
				frag = document.createElement(tag);
				break;
			case "SPAN":
				frag = document.createElement("span");
				frag.style.fontFamily = node.style.fontFamily;
				frag.style.fontSize = node.style.fontSize;
				break;
			default:
				if(node.childNodes.length === 1){
					return formatHTML(node.firstChild);
				}
				frag = document.createDocumentFragment();
			}
		}
		[].slice.call(node.childNodes).forEach(function(cnode){
			var nnode = recFormatHTML(cnode);
			if(nnode){ frag.appendChild(nnode); }
		});
		return frag;
	}

	function recFormatHTML(node) {
		var tag, frag;
		if(node.nodeType === Node.TEXT_NODE){
			return /\^[BIU]/.test(node.textValue)?
				document.createTextNode(node.textValue.replace(/\^[BIU]|\|/g,"")):
				node.cloneNode(false);
		}else if(node.nodeType === Node.ELEMENT_NODE){
			tag = node.nodeName;
			outer: switch(tag){
			case "BR": return node.cloneNode(false);
			case "U": case "B": case "I":
				frag = document.createElement(tag);
				break;
			default:
				switch(node.childNodes.length){
				case 0: return null;
				case 1: return recFormatHTML(node.firstChild);
				default:
					frag = document.createDocumentFragment();
				}
			}
		}
		[].slice.call(node.childNodes).forEach(function(cnode){
			var nnode = formatHTML(cnode);
			if(nnode){ frag.appendChild(nnode); }
		});
		return frag;
	}
	
	//Turn HTML into the closest corresponding STL text
	function HTML2STL(parent){
		return minimizeSTLText(
			[].map.call(parent.childNodes,function(node){
				var tag;
				if(node.nodeType === Node.TEXT_NODE){
					return node.nodeValue
							.replace(/[\r\n]+/g,' ')
							.replace(/\^[BIU]/g,'');
				}else if(node.nodeType !== Node.ELEMENT_NODE){ return ""; }
				tag = node.nodeName;
				switch(tag){
				case "BR": return "|";
				case "I": case "U": case "B":
					return "^"+tag+HTML2STL(node)+"^"+tag;
				default:
					return HTML2STL(node);
				}
			}).join('')
		);
	}

	//Turn STL text into the corresponding HTML
	function STL2HTML(text){
        var DOM = document.createElement('span'),
			current = DOM,
			stack = [];

		normTextControls(text)
			.split(/(\^[BIU]|\|)/g)
			.forEach(function(token){
			var ttype, node;
			ttype = token[0];
			if(ttype === "^"){
				if(token[1] === current.nodeName){ //Closing tag
					current = current.parentNode;
				}else{ //Opening tag
					node = document.createElement(token[1]);
					current.appendChild(node);
					current = node;
				}
			}else if(ttype === "|"){
				current.appendChild(document.createElement('br'));
			}else{ //Text
				current.appendChild(document.createTextNode(token));
			}
		});
		return DOM;
	}
	
	/**Serialization Functions**/

	function STLtime(time){
		var seconds = Math.floor(time),
			minutes = Math.floor(seconds/60),
			hh,mm,ss,frameNumber;
		hh = Math.floor(minutes/60);
		mm = (minutes%60);
		ss = (seconds%60);
		frameNumber = Math.floor(24* (time-seconds));
		return (hh>9?hh:"0"+hh)+":"
				+(mm>9?mm:"0"+mm)+":"
				+(ss>9?ss:"0"+ss)+":"
				+(frameNumber>9?frameNumber:("0"+frameNumber));
	}

	function serializeCue(cue,settings){
		var lines = [];
		cueProperties.forEach(function(k){
			var setting = cue[k];
			if(setting === settings[k]){ return; }
			settings[k] = setting;
			switch(typeof setting){
			case 'string': lines.push('$'+k+' = '+setting);break;
			case 'number': lines.push('$'+k+' = '+setting.toString(10));break;
			case 'boolean': lines.push('$'+k+' = '+(setting?"True":"False"));break;
			}
		});

		//remove leading control codes; they're already handled above
		return lines.join('\n')
			+ STLtime(cue.startTime) + ' , ' + STLtime(cue.endTime) + ' , '
			+ cue.text.replace(/^(\^[BIU])+/,"");
	}

	function serialize(track){
		var settings = {};
		return [].map.call(track.cues,function(cue){ return serializeCue(cue,settings); }).join('');
	}

	/**Parser Functions**/

	function parseBool(v){
		switch(v){
		case 'True': return true;
		case 'False': return false;
		default: throw new SyntaxError("Invalid Value For Boolean Setting");
		}
	}

	function parseHorz(v){
		v = String(v).toLowerCase();
		if(['left','right','center'].indexOf(v) > -1){
			return v;
		}
		throw new SyntaxError("Invalid Value For Horizontal Alignment");
	}

	function parseVert(v){
		v = String(v).toLowerCase();
		if(['top','bottom','center'].indexOf(v) > -1){
			return v;
		}
		throw new SyntaxError("Invalid Value For Vertical Alignment");
	}

	function parseNum(v){ return parseInt(v,10); }
	function parseStr(v){ return v; }

	function parse_timestamp(input){
		var fields = timePat.exec(input);
		if(!fields){ throw new SyntaxError("Malformed Timestamp"); }
		return 	parseInt(fields[1],10)*3600 +
				parseInt(fields[2],10)*60 +
				parseInt(fields[3],10) +
				Math.min(parseInt(fields[4],10),24) / 24;
	}

	function parseCue(cueList,line,id,settings){
		var cue, text, fields;
		fields = cuePat.exec(line);
		if(!fields){ throw new SyntaxError("Malformed Entry"); }

		//skip graphics file entries
		text = fields[3];
		if(settings.SetFilePathToken && text.indexOf(settings.SetFilePathToken) === 0){ return; }

		//create the cue
		cue = new STLCue(
			parseTimestamp(fields[1]),
			parseTimestamp(fields[2]),
			text
		);
		cue.id = id;
		cueProperties.forEach(function(k){
			if(setting.hasOwnProperty(k)){ cue[k] = settings[k]; }
		});
		cueList.push(cue);
	}

	function parse(input){
		var match,line,
			fields,cue,id=0,
			settings = {},
			cueList = [],
			len = input.length;

		//If the first character is a BYTE ORDER MARK, skip it.
		linePat.lastIndex = +(input[0] === '\uFEFF');
		match = linePat.exec(input);

		while(match){ //examine one line at a time
			line = match[1];
			if(line[0] === '$'){
				fields = setPat.exec(line);
				if(fields && commandParsers.hasOwnProperty(fields[1])){
					settings[fields[1]] = commandParsers[fields[1]](fields[2]);
				}
			}else if(/\d/.test(line[0])){
				parseCue(cueList,line,String(++id),settings)
			}else if(line.substr(0,2) !== '//'){ //comments
				throw new SyntaxError("Invalid STL Entry or Command");
			}
			match = linePat.exec(input);
		}
		return {
			cueList: cueList,
			kind: 'subtitles',
			lang: '',
			label: ''
		};
	}

	TimedText.registerType('text/stl', {
		extension: 'stl',
		name: 'Spruce Subtitle',
		cueType: STLCue,
		isCueCompatible: function(cue){ return cue instanceof STLCue; },
		formatHTML: formatHTML,
		textFromHTML: HTML2STL,
		positionCue: null,
		updateCueTime: null,
		updateCueContent: null,
		attachEditor: null,
		parse: parse,
		serialize: serialize
	});
}(window.TimedText));