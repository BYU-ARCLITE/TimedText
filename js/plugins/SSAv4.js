(function(TimedText){
	"use strict";

	if(!TimedText){ throw new Error("TimedText not defined."); }

	//Regexes for identifying line types
	var HeaderLine = /^\[.*?\]\s*$/;
	var InfoHeader = /^\[Script Info\]\s*$/;
	var StyleHeader = /^\[V4\+ Styles\]\s*$/;
	var EventsHeader = /^\[Events\]\s*$/;
	var FontsHeader = /^\[Fonts\]\s*$/;
	var GraphicsHeader = /^\[Graphics\]\s*$/;
	var EventLine = /^(Dialogue|Picture):\s*(.*)$/;
	var TitleLine = /^Title:\s*(.*)$/;
	var TimerLine = /^Timer:\s*(.*)$/;
	var SyncLine = /^Sync Point:\s*(.*)$/;
	var WrapLine = /^WrapStyle:(.*)$/;
	var FormatLine = /^Format:\s*(.*)$/;
	var StyleLine = /^Style:\s*(.*)$/;
	var FileLine = /^filename:\s*(.*)$/;

	//[^;!\s] matches non-whitespace, non-semicolon, non-exclamation;
	//automatically skips comment lines
	var linePat = /^\s*([^;!\s].*?)\s*$/gm;
	var timePat = /\s*(\d):([0-5]\d):([0-5]\d)\.(\d\d)\s*/;

	//Maps vextensions to file types for valid embedded file types
	//Used by parseGraphicFile; will be used to properly render Picture cues
	var mime_map = {
		'.bmp': 'image/bmp',
		'.jpg': 'image/jpeg',
		'.gif': 'image/gif',
		'.ico': 'image/x-icon',
		'.wmf': 'image/x-wmf'
	};

	var defaultStyle = {
		Name: "DefaultStyle",
		Fontname: "Arial",
		Fontsize: 12,
		PrimaryColour: 0xFF000000, //AABBGGRR
		SecondaryColour: 0xFF000000, //AABBGGRR
		OutlineColour: 0xFF000000, //AABBGGRR
		BackColour: 0x88888888, //AABBGGRR
		Bold: false, Italic: false, Underline: false, Strikeout: false,
		ScaleX: 100, ScaleY: 100, Spacing: 0, Angle: 0,
		BorderStyle: 1, Outline: 0, Shadow: 0,
		Alignment: 2, MarginL: 0, MarginR: 0, MarginV: 0
	};

	/** SubStation Alpha Cue Class Definitions **/
	var ASSCue = TimedText.makeCueType(function(){
		this.wrapStyle = 0;
		this.type = "Dialogue";
		this.name = "";
		this.layer = 0;
		this.style = defaultStyle;
		this.marginL = 0;
		this.marginR = 0;
		this.marginV = 0;
		this.effect = "";
		this.data = null;
	});

	//doesn't handle all the modes, because the VTT rendering rules subsume some of them
	//for now, eliminate all styling; later, implement our own rendering rules
	//to handle SubStation override codes
	function processCueText(text, mode){
		//replace with actual ASS text processing algorithm
		var dom = document.createDocumentFragment(),
			el = document.createElement('span'),
			newText = text.replace(/\\n|\\N|\\h|(\{\\.*?\})|[<>]/g, function(match){
				switch(match){
				case '\\n': return mode === 1?' ':'<br/>';
				case '\\N': return '<br data-hard=1/>';
				case '\\h': return '&nbsp;';
				case '<': return '&lt;';
				case '>': return '&gt;';
				default: return '';
				}
			});
		el.innerHTML = newText;
		[].slice.call(el.childNodes).forEach(dom.appendChild.bind(dom));
		return dom;
	}

	ASSCue.prototype.getCueAsHTML = function(){
		if(!this.DOM){
			this.DOM = processCueText(this.text, this.wrapStyle);
		}
		return this.DOM.cloneNode(true);
	};
	
	ASSCue.prototype.sanitizeText = function(t){
		return t.replace(/\r?\n/g,'\\N');
	};

	/**Editor Interaction Functions **/

	//For now, remove all formatting
	//Later, figure out how to translate to SubStation overrides.
	//http://docs.aegisub.org/3.1/ASS_Tags/
	function formatHTML(node){
		if(node.parentNode === null){ return null; }
		if(node.nodeType === Node.TEXT_NODE){ return node; }
		return document.createTextNode(node.textContent);
	}

	function HTML2SSA(node){ return node.textContent; }

	/** Serialization Functions **/

	//Turns a byte buffer into a 6-bit text-encoded string
	//Each line is 80 characters, except the last.
	//Used by serializeGraphics
	function encodeFile(data){
		var i, j, p1, p2, p3, p4,
			output = [], line = [],
			len = data.length, tail;
		for(i=0,j=0;i<len;i+=3){
			p1 = data[i];
			p2 = data[i+1];
			p3 = data[i+2];
			p4 = data[i+3];
			line.push(
				String.fromCharCode((p1>>2)+33)+
				String.fromCharCode((((p1&0x3)<<4)|(p2>>4))+33)+
				String.fromCharCode((((p2&0xf)<<2)|(p3>>6))+33)+
				String.fromCharCode((p3&0x3f)+33)
			);
			if(++j === 20){
				output.push(line.join(''));
				line.length = 0;
				j = 0;
			}
		}

		if(len - i === 1){
			p1 = data[i];
			line.push(String.fromCharCode((p1>>2)+33)
						+String.fromCharCode(((p1&0x3)<<4)+33));
		}else if(len - i === 2){
			p1 = data[i];
			p2 = data[i+1];
			line.push(String.fromCharCode((p1>>2)+33)
						+String.fromCharCode((((p1&0x3)<<4)|(p2>>4))+33)
						+String.fromCharCode(((p2&0xf)<<2)+33));
		}

		tail = line.join('');
		if(tail.length <= 80){ output.push(tail); }
		else{ output.push(tail.substr(0,80),tail.substr(80)); }
		return output.join('\n');
	}

	//Collects & deduplicates all graphics files referenced by picture cues
	//and outputs their text-encoded forms in a [Graphics] section.
	function serializeGraphics(cues){
		var graphics = {}, names;
		cues.forEach(function(cue){ if(!cue.data){ return; }
			graphics[cue.text.substr(
				Math.max(cue.text.lastIndexOf('/'),cue.text.lastIndexOf('\\'))+1
			)] = cue.data;
		});
		names = Object.keys(graphics);
		return names.length?("[Graphics]\n"+
			names.map(function(name){
				return "filename: "+name+'\n'
					+encodeFile(graphics[name])+'\n';
			}).join('')):'';
	}

	//Converts a number into a four-digit integer string,
	//with leading zeros. Used by serializeStyles & serializeEvents
	function to4digit(num) {
		var s = "0000" + num.toString(10);
		return s.substr(s.length-4);
	}

	//Collects & deduplicates all styles referenced by cues
	//and serializes them in a [V4+ Styles] section.
	//This section is always included, even if it's empty.
	function serializeStyles(cues){
		var styles = {};
		cues.forEach(function(cue){ styles[cue.style.Name] = cue.style; });

		return "[V4+ Styles]\nFormat: Name,Fontname,Fontsize,"
			+"PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
			+"Bold,Italic,Underline,Strikeout,ScaleX,ScaleY,Spacing,Angle,"
			+"BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
			+Object.keys(styles).map(function(k){
				var style = styles[k];
				return "Style: "+k+','
					+style.Fontname+','
					+style.Fontsize.toString(10)+','
					+style.PrimaryColour.toString(10)+','
					+style.SecondaryColour.toString(10)+','
					+style.OutlineColour.toString(10)+','
					+style.BackColour.toString(10)+','
					+(style.Bold?'-1,':'0,')
					+(style.Italic?'-1,':'0,')
					+(style.Underline?'-1,':'0,')
					+(style.Strikeout?'-1,':'0,')
					+style.ScaleX.toString(10)+','
					+style.ScaleY.toString(10)+','
					+style.Spacing.toString(10)+','
					+style.Angle.toString(10)+','
					+style.BorderStyle.toString(10)+','
					+style.Outline.toString(10)+','
					+style.Shadow.toString(10)+','
					+style.Alignment.toString(10)+','
					+to4digit(style.MarginL)+','
					+to4digit(style.MarginR)+','
					+to4digit(style.MarginV)+',0\n';
			}).join('');
	}

	//For now, just remove all formatting during serialization.
	//Later, once we can translate HTML to SubStation overrides,
	//this will be unnecessary
	function escapeText(text){
		var el = document.createElement('div');
		el.innerHTML = text;
		return el.textContent.replace('\n','\\n');
	}

	//Turns floating point seconds into an SSA timestamp
	//Used by serializeEvents
	function SSATime(time){
		var seconds = Math.floor(time),
			minutes = Math.floor(seconds/60),
			hh,mm,ss,cs;
		hh = Math.min(Math.floor(minutes/60),9);
		mm = (minutes%60);
		ss = (seconds%60);
		cs = Math.floor(100*(time-seconds));
		return hh+":"+(mm>9?mm:"0"+mm)+":"+(ss>9?ss:"0"+ss)+"."+(cs>9?cs:"0"+cs);
	}

	//Serializes Dialogue and Picture cues
	//and collects them into an [Events] section
	function serializeEvents(cues){
		return "[Events]\nFormat: Marked, Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
			+cues.map(function(cue){
				return cue.type+": 0,"
					+cue.layer.toString(10)+','
					+SSATime(cue.startTime)+','
					+SSATime(cue.endTime)+','
					+cue.style.Name+','
					+cue.name+','
					+to4digit(cue.marginL)+','
					+to4digit(cue.marginR)+','
					+to4digit(cue.marginV)+','
					+cue.effect+','
					//The text of a Picture event is the name of the graphic file
					+escapeText(cue.text);
			}).join('\n');
	}

	//Top-level function whihc serializes a text track
	//into a SubStation Alpha-format text file
	function serialize(data){
		if(!(data instanceof Array)){ data = data.cues; }
		return "[Script Info]\nTitle:<untitled>\nOriginal Script:<unknown>\nScriptType: v4.00+\nCollisions: Normal\nPlayResY: 1080\nPlayResX: 1920\nPlayDepth: 0\nTimer: 100.0000\nWrapStyle: 0\n\n"
		+serializeStyles(data)+'\n'
		+serializeEvents(data)+'\n'
		+serializeGraphics(data);
	}

	/**Parsing Functions**/

	//Parse an SSA timestamp into floating point seconds
	//Used by parseInfo and parseEventLine
	function parseTimestamp(time){
		var match = timePat.exec(time);
		if(!match){ throw new Error(); }
		return parseInt(match[1],10)*3600
			+parseInt(match[2],10)*60
			+parseInt(match[3],10)
			+parseInt(match[4],10)/100;
	}

	//Reads one line of text-encoded binary data back into a byte buffer
	function decodeLine(globals, line){
		var i, j, p1, p2, len, mod, buffer;
		mod = line.length%4;
		if(mod === 1){ throw new SyntaxError("Corrupted File"); }
		len = Math.floor(line.length/4);
		buffer = new Uint8Array(len*3+(mod?mod-1:0));
		len *= 4;
		for(i=0,j=0;i<len;i+=4,j+=3){
			p1 = line.charCodeAt(i+1)-33;
			p2 = line.charCodeAt(i+2)-33;
			buffer[j] = (line.charCodeAt(i)-33)<<2 | (p1&0x30)>>4;
			buffer[j+1] = (p1&0xf)<<4 | (p2&0x3c)>>2;
			buffer[j+3] = (p2&0x3)<<6 | (line.charCodeAt(i+3)-33);
		}
		if(mod === 2){
			buffer[j] = ((line.charCodeAt(i)-33)&0x3f)<<2 |
						((line.charCodeAt(i+1)-33)&0x30)>>4;
		}else if(mod === 3){
			p1 = line.charCodeAt(i+1);
			buffer[j] = ((line.charCodeAt(i)-33)&0x3f)<<2 | (p1&0x30)>>4;
			buffer[j+1] = (p1&0xf)<<4 | ((line.charCodeAt(i+2)-33)&0xf0)>>4;
		}
		globals.file.chunks.push(buffer);
	}

	//Turn a list of chunks for a file-in-progress into a single byte buffer,
	//and add it to the global file register by file name
	function finalizeFile(globals){
		var size, buffer, chunk,
			chunks = globals.file.chunks;
		size = chunks.reduce(function(acc,n){ return acc+n.length; },0);
		buffer = new Uint8Array(size);
		while(chunks){
			chunk = chunks.pop();
			size -= chunk.length;
			buffer.set(chunk, size);
		}
		globals.files[globals.file.name] = buffer;
		globals.file = null;
	}

	function parseFontFile(globals, line){
		//For now, all embedded fonts are ignored
		//In the future, it might be possible to dynamically load these into the browser
		if(HeaderLine.test(line)){
			return dispatchHeader(line, parseFontFile);
		}
		return parseFontFile;
	}

	//Turn text-encoded embedded files back into binary data
	function parseGraphicFile(globals, line){
		var match, name;
		//For now, all embedded images are ignored
		//In the future, these should be dynamically inserted into Picture cues
		if(match = FileLine.exec(line)){
			name = match[1]; //Start a new file
			//Finalise any in progress, and skip files of unusable types
			if(globals.file){ finalizeFile(globals); }
			if(mime_map.hasOwnProperty(name.substr(name.length-4))){
				globals.file = {name: name, chunks: []};
			}
		}else if(HeaderLine.test(line)){
			if(globals.file){ finalizeFile(globals); }
			return dispatchHeader(line, parseGraphicFile);
		}else if(globals.file){ decodeLine(globals, line); }
		return parseGraphicFile;
	}

	//Utility function for extracting fields from an event line.
	//Can't use a basic string split because it must respect the
	//field count determined by parseEventFormat, where the final
	//field is allowed to contain commas.
	function parseEventFields(line, fnum){
		var i, fromIndex = 0, flist = [];
		for(0;fnum > 1; fnum--){
			i = line.indexOf(",", fromIndex)+1;
			if(i === -1){ throw 0; }
			flist.push(line.substring(fromIndex,i-1).trim());
			fromIndex = i;
		}
		flist.push(line.substr(fromIndex).trim());
		return flist;
	}

	//Utility function for parsing Event declarations based on the field order
	//determined by parseEventFormat; used by the parseEvents state function below
	function parseEventLine(globals, type, info){
		var fields, settings, format;

		//The lack of guarantees about section ordering means we have to
		//store all the data needed to construct cues, and then actually
		//construct the cues later in a separate pass.
		format = globals.format;
		try{ fields = parseEventFields(info, globals.fieldNum); }
		catch(_){ return; }

		settings = {
			id: (++globals.id).toString(10),
			type: type,
			wrapStyle: globals.wrapStyle
		};

		if(format.hasOwnProperty("Name")){ settings.name = fields[format.Name]; }
		if(format.hasOwnProperty("Effect")){ settings.effect = fields[format.Effect]; }
		if(format.hasOwnProperty("Layer")){
			settings.layer = parseInt(fields[format.Layer],10);
		}
		if(format.hasOwnProperty("MarginL")){
			settings.marginL = parseInt(fields[format.MarginL],10);
		}
		if(format.hasOwnProperty("MarginR")){
			settings.marginR = parseInt(fields[format.MarginR],10);
		}
		if(format.hasOwnProperty("MarginV")){
			settings.marginV = parseInt(fields[format.MarginV],10);
		}

		globals.cuedata.push({
			start: globals.tmul*parseTimestamp(fields[format.Start])+globals.sync,
			end: globals.tmul*parseTimestamp(fields[format.End])+globals.sync,
			text: fields[format.Text],
			style: fields[format.Style],
			settings: settings
		});
	}

	//State function for parsing event (cue) lines
	function parseEvents(globals, line){
		var match = EventLine.exec(line);
		if(match){
			parseEventLine(globals, match[1], match[2]);
		}else if(HeaderLine.test(line)){
			return dispatchHeader(line, parseStyles);
		}
		//ignore Comment, Sound, Video, and Command events.
		return parseEvents;
	}

	//Determines the order and number of fields in the Events section
	//Must occur before any actual event (cue) declarations
	function parseEventFormat(globals,line){
		var flist, match = FormatLine.exec(line);
		if(!match){ throw new SyntaxError("Missing Event Format Line"); }

		flist = match[1].split(/\s*,\s*/g);
		globals.fieldNum = flist.length;
		flist.forEach(function(field, index){
			globals.format[field] = index;
		});
		return parseEvents;
	}

	//Parse Style declarations based on the field order
	//determined by parseStyleFormat
	function parseStyles(globals,line){
		var match, fields, style,
			format = globals.format;
		if(match = StyleLine.exec(line)){
			fields = match[1].split(/\s*,\s*/g);
			style = {
				Name: fields[format.Name],
				Fontname: fields[format.Fontname],
				Fontsize: parseInt(fields[format.Fontsize],10),
				PrimaryColour: parseInt(fields[format.PrimaryColour],10),
				SecondaryColour: parseInt(fields[format.SecondaryColour],10),
				OutlineColour: parseInt(fields[format.OutlineColour],10),
				BackColour: parseInt(fields[format.BackColour],10),
				Bold: +fields[format.Bold] === -1 ? true : false,
				Italic: +fields[format.Italic] === -1 ? true : false,
				Underline: +fields[format.Underline] === -1 ? true : false,
				Strikeout: +fields[format.Strikeout] === -1 ? true : false,
				ScaleX: Math.max(parseInt(fields[format.ScaleX],10),0),
				ScaleY: Math.max(parseInt(fields[format.ScaleY],10),0),
				Spacing: parseInt(fields[format.Spacing],10),
				Angle: parseFloat(fields[format.ScaleY]) % 360,
				BorderStyle: parseInt(fields[format.BorderStyle],10),
				Outline: Math.max(Math.min(parseInt(fields[format.Outline],10),4),0),
				Shadow: Math.max(Math.min(parseInt(fields[format.Shadow],10),4),0),
				Alignment: Math.max(Math.min(parseInt(fields[format.Alignment],10),9),1),
				MarginL: parseInt(fields[format.MarginL],10),
				MarginR: parseInt(fields[format.MarginR],10),
				MarginV: parseInt(fields[format.MarginV],10)
			};
			if(style.BorderStyle !== 1 && style.BorderStyle !== 3){
				style.BorderStyle = 1;
			}
			globals.styles[style.Name] = style;
		}else if(HeaderLine.test(line)){
			return dispatchHeader(line, parseStyles);
		}
		return parseStyles;
	}

	//Determines the order of fields in the Styles section
	//Must occur before any actual style declarations
	function parseStyleFormat(globals,line){
		var match = FormatLine.exec(line);
		if(!match){ throw new SyntaxError("Missing Style Format Line"); }

		match[1].split(/\s*,\s*/g).forEach(function(field, index){
			globals.format[field] = index;
		});
		return parseStyles;
	}

	//Parse the file headers
	function parseInfo(globals,line){
		var match = TitleLine.exec(line);
		if(match){
			globals.title = match[1].trim();
		}else if(SyncLine.test(line)){
			globals.sync = parseTimestamp(line.substr(11));
		}else if(TimerLine.test(line)){
			globals.tmul = (parseFloat(line.substr(6))||100)/100;
		}else if(WrapLine.test(line)){
			globals.wrapStyle = Math.max(parseInt(line.substr(10),10),0);
			if(globals.wrapStyle > 3){ globals.wrapStyle = 0; }
		}else if(HeaderLine.test(line)){
			return dispatchHeader(line, parseInfo);
		}
		return parseInfo;
	}

	//Utility function used by multiple state functions.
	//Allows sections other than Info to appear in any order,
	//because the "spec" doesn't say they can't.
	function dispatchHeader(line, def){
		switch(true){
		case StyleHeader.test(line):	return parseStyleFormat;
		case EventsHeader.test(line):	return parseEventFormat;
		case FontsHeader.test(line):	return parseFontFile;
		case GraphicsHeader.test(line):	return parseGraphicFile;
		}
		return def;
	}

	//Top-level function for parsing a text file
	//Sets up a container object for global parser state
	//and passes one line at a time into a state machine
	function parse(input){
		var match, cuelist,
			state = parseInfo,
			globals = {
				id: 0, //counter for sequential cue IDs
				sync: 0, tmul: 1, //timing settings
				wrapStyle: 0, //flag for calculating line breaks
				title: "", //Title of the track
				styles: { //set of cue styles
					DefaultStyle: defaultStyle
				},
				format: {}, //maps field names to indices for styles & events
				fieldNum: 0, //number of fields in an event declaration
				file: null, //holds a file-in-progess when parsing graphics
				files: {}, //maps names to graphic file data
				cuedata: [] //list of objects holding data needed to construct cues
			};

		//The initial pass collects data into the cuedata array,
		//along with styles and graphics files. A post-processing pass
		//uses the collected data to generate actual Cue objects

		//If the first character is a BYTE ORDER MARK, skip it.
		linePat.lastIndex = +(input[0] === '\uFEFF');

		match = linePat.exec(input);
		if(!match || !InfoHeader.test(match[1])){throw new Error("Not SSA Data");}

		//State machine loop; each state is a function.
		//The loop reads one line at a time and feeds it into the current state.
		//Each state function returns the next state based on the given line.
		match = linePat.exec(input);
		while(match){
			state = state(globals, match[1]);
			match = linePat.exec(input);
		}

		//generate actual cue objects
		cuelist = globals.cuedata.map(function(data){
			var cue = new ASSCue(data.start,data.end,data.text);
			cue.style = globals.styles[data.style] || globals.styles.DefaultStyle;
			Object.keys(data.settings).forEach(function(k){
				cue[k] = data.settings[k];
			});
			if(cue.type === "Picture"){
				cue.data = globals.files[cue.text.substr(
					Math.max(cue.text.lastIndexOf('/'),cue.text.lastIndexOf('\\'))+1
				)]||null;
			}
			return cue;
		});

		return {
			cueList: cuelist,
			kind: 'subtitles',
			lang: '',
			label: globals.title
		};
	}

	TimedText.registerType('text/x-ssa',{
		extension: 'ass',
		name: 'Sub Station Alpha',
		cueType: ASSCue,
		isCueCompatible: function(cue){ return cue instanceof ASSCue; },
		formatHTML: formatHTML,
		textFromHTML: HTML2SSA,
		positionCue: null,
		updateCueTime: null,
		updateCueContent: null,
		attachEditor: null,
		parse: parse,
		serialize: serialize
	});
}(window.TimedText));