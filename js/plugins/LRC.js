(function(TimedText){
	"use strict";

	if(!TimedText){ throw new Error("TimedText not defined."); }

	var cuePat = /\[(\d\d+):([0-5]\d).(\d\d)\]\s*(.*?)\s*/;
	var timePat = /<(\d\d+):([0-5]\d).(\d\d)>/;
	var titlePat = /\[ti:\s*(.*?)\s*\]/;
	var offsetPat = /\[offset:\s*(\d*)\s*\]/;
	var lengthPat = /\[length:\s*(\d+):([0-5]\d[\d.]*)\]/;
	var linePat = /^(\s*\S.+?)\s*$/gm;

	var LRCCue = TimedText.makeCueType(function(){});

	LRCCue.prototype.getCueAsHTML = function(){
		if(!this.DOM){
			this.DOM = LRC2HTML(this.text);
		}
		return this.DOM.cloneNode(true);
	};

	LRCCue.prototype.sanitizeText = function(t){
		return t.replace(/[\r\n]+/g,' ');
	};

	/**HTML Manipulation Functions**/

	//strip out any html aside from karaoke tags
	function formatHTML(node) {
		var frag;
		if(node.nodeType === Node.TEXT_NODE){
			return document.createTextNode(node.nodeValue.replace(/[\r\n]+/g,' '));
		}
		if(node.nodeType !== Node.ELEMENT_NODE){
			return document.createDocumentFragment();
		}
		if(node.nodeName === "I" && node.dataset.target === "timestamp"){
			return node.cloneNode(false);
		}
		frag = document.createDocumentFragment();
		[].slice.call(node.childNodes).forEach(function(cnode){
			frag.appendChild(formatHTML(cnode));
		});
		return frag;
	}

	//Turn HTML into the closest corresponding LRC text
	function HTML2LRC(parent){
		[].map.call(parent.childNodes,function(node){
			if(node.nodeType === Node.TEXT_NODE){
				return node.nodeValue.replace(/[\r\n]+/g,' ');
			}
			if(node.nodeType !== Node.ELEMENT_NODE){ return ""; }
			if(node.nodeName === "I" && node.dataset.target === "timestamp"){
				return node['data-timestamp'];
			}
			return HTML2LRC(node);
		}).join('');
	}

	function createTimestampNode(timeData){
		var node,
			mm = parseInt(timeData[1],10)||0,
			ss = parseInt(timeData[2],10)||0,
			cs = parseInt(timeData[4],10)||0;

		node = document.createElement('i');
		node.dataset.target = "timestamp";
		node.dataset.seconds = mm*60+ss+cs/100;

		node.dataset.timestamp = '<'+
					(mm>9?mm:"0"+mm)+":"+
					(ss>9?ss:"0"+ss)+"."+
					(cs>9?cs:"0"+cs) + '>';
		return node;
	}

	//Turn LRC text into the corresponding HTML
	function LRC2HTML(input){
        var DOM = document.createDocumentFragment();
		input
			.split(/(<\d\d+:[0-5]\d.\d\d>)/g)
			.forEach(function(token){
				var match = timePat.exec(token);
				if(match){ // Karaoke tag
					DOM.appendChild(createTimestampNode(match));
				}else{
					DOM.appendChild(document.createTextNode(token));
				}
			});
		return DOM;
	}

	/**Serialization Functions**/

	function LRCtime(time){
		var seconds = Math.floor(time),
			mm = Math.floor(seconds/60),
			ss,cs;
		ss = (seconds%60);
		cs = Math.floor(100*(time-seconds));
		return '['+(mm>9?mm:"0"+mm)+":"
				+(ss>9?ss:"0"+ss)+"."
				+(cs>9?cs:"0"+cs)+']';
	}

	function serializeCue(cue){
		return LRCtime(cue.startTime)+cue.text;
	}

	function serialize(track){
		//TODO: serialize track title information
		var end = track.cues.reduce(function(acc,c){
			return Math.max(acc,c.endTime);
		});
		return '[length: '
			+Math.round(end/60).toString(10)+':'
			+Math.round(end%60).toString(10)+']\n'
			+[].map.call(track.cues,serializeCue).join('\n');
	}

	/**Parser Functions**/

	function parse(input){
		var match, line,
			time, title = "",
			offset = 0, length = 0,
			cuedata = [], cueList = [];

		//If the first character is a BYTE ORDER MARK, skip it.
		linePat.lastIndex = +(input[0] === '\uFEFF');
		match = linePat.exec(input);

		//First pass: accumulate text and start times
		while(match){ //examine one line at a time
			line = match[1];
			if(match = titlePat.exec(line)){
				title = match[1];
			}else if(match = offsetPat.exec(line)){
				offset = parseInt(match[1],10)/1000;
			}else if(match = lengthPat.exec(line)){
				length = parseInt(match[1],10)*60 + parseFloat(match[2]);
			}else if(match = cuePat.exec(line)){
				time = parseInt(match[1],10)*60
							+parseInt(match[2],10)
							+parseInt(match[3],10)/100;
				cuedata.push({start: time+offset, end: 0, text: match[4]});
			}
			match = linePat.exec(input);
		}

		//Second pass: fill in end times
		cuedata.sort(function(a,b){ return a.start<b.start?-1:1; });
		cueList = cuedata.map(function(data,i){
			var cue, end = (i >= cuedata.length)?
						((length > data.start)?length:(data.start+60)):
						cuedata[i+1].start;
			cue = new LRCCue(data.start, end, data.text);
			cue.id = (i+1).toString(10);
			return cue;
		});

		return {
			cueList: cueList,
			kind: 'subtitles',
			lang: '',
			label: title
		};
	}

	TimedText.registerType('text/subtitle+lrc', {
		extension: 'lrc',
		name: 'Enhanced Lyric',
		cueType: LRCCue,
		isCueCompatible: function(cue){ return cue instanceof LRCCue; },
		formatHTML: formatHTML,
		textFromHTML: HTML2LRC,
		positionCue: null,
		updateCueTime: null,
		updateCueContent: null,
		attachEditor: null,
		parse: parse,
		serialize: serialize
	});
}(window.TimedText));