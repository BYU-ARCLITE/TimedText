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
	
	//https://dvcs.w3.org/hg/ttml/raw-file/tip/ttml10/spec/ttaf1-dfxp.html#timing-value-timeExpression
	var clockTimePat = /^\s*(\d\d+):(\d\d):(\d\d)(\.\d+|:(\d\d+)(\.\d+)?)?\s*$/;
	var offsetTimePat = /^\s*(\d+)(\.\d+)?(h|m|s|ms|f|t)\s*$/;
	function parseTTMLTime(timestamp, globals){
		var match, time, frames, subframes;
		if(match = clockTimePat.exec(timestamp)){
			time = parseInt(match[1])*3600 + parseInt(match[2])*60 + parseInt(match[3]);
			if(typeof match[4] === 'undefined'){ return time; }
			if(match[4][0] === '.'){ time += parseFloat("0"+match[4]); }
			else{
				frames = parseInt(match[5]);
				subframes = parseInt(match[6]);
				if(frames > globals.frameRate || subframes > globals.subFrameRate){
					throw new Error("Invalid frame number");
				}
				time += (frames + subframes/globals.subFrameRate) / globals.effectiveFrameRate;
			}
			return time;
		}else if(match = offsetTimePat.exec(timestamp)){
			time = parseInt(match[1]);
			if(typeof match[2] !== 'undefined'){ time += parseFloat("0"+match[2]); }
			switch(match[3]){
			case 'h': return time * 3600;
			case 'm': return time * 60;
			case 's': return time;
			case 'ms': return time / 1000;
			case 'f': return time / globals.effectiveFrameRate;
			case 't': return time / globals.tickRate;
			}
		}
		throw new Error("Invalid Time Expression");
	}
	
	function parse_head(head, globals){}
	
	function parse_body(body, globals){
		var arr = [];
		return arr.concat.apply(arr,arr.map.call(body.getElementsByTagName('div'), function(div){
			return [].map.call(div.getElementsByTagName('p'),function(p){
				var start, end,
					hasDur = p.hasAttribute('dur'),
					hasStart = p.hasAttribute('begin'),
					hasEnd = p.getAttribute('end');
				getTime:{
					if(hasStart){
						start = parseTTMLTime(p.getAttribute('begin'), globals);
						if(hasEnd || hasDur){
							end = Math.min(
								hasEnd?parseTTMLTime(p.getAttribute('end'), globals):1/0,
								hasDur?(start + parseTTMLTime(p.getAttribute('dur'), globals)):1/0);
							break getTime;
						}
					}else if(hasEnd && hasDur){
						end = parseTTMLTime(p.getAttribute('end'), globals);
						start = end - parseTTMLTime(p.getAttribute('dur'), globals);
						break getTime;
					}
					throw new Error("Incomplete Duration");
				}
					
				return new TTMLCue(start,end,XMLDecode(p.textContent));
			});
		}));
	}
	
	function parse_root_settings(root, globals){
		var tmpstr, tmpnum, match;
		
		if(root.hasAttribute('ttp:timeBase') && root.getAttribute('ttp:timeBase') !== "media"){
			throw new Error("Unsupported Time Base");
		}
		
		if(root.hasAttribute('ttp:frameRate')){
			tmpstr = root.getAttribute('ttp:frameRate');
			if(/\s*\d+\s*/.test(tmpstr)){
				globals.frameRate = parseInt(tmpstr,10)||30;
				globals.effectiveFrameRate = globals.frameRate;
			}
		}
		
		if(root.hasAttribute('ttp:frameRateMultiplier')){
			tmpstr = root.getAttribute('ttp:frameRateMultiplier');
			if(match = /\s*(\d+) (\d+)\s*/.exec(tmpstr)){
				tmpnum = parseInt(match[1],10) / parseInt(match[2],10);
				if(tmpnum !== 0 && tmpnum !== 1/0){ globals.effectiveFrameRate *= tmpnum; }
			}
		}
		
		if(globals.frameRate|0 === globals.frameRate && root.hasAttribute('ttp:subFrameRate')){
			tmpstr = root.getAttribute('ttp:subFrameRate');
			if(/\s*\d+\s*/.test(tmpstr)){
				globals.subFrameRate = parseInt(tmpstr,10) || 1;
			}
		}
		
		if(root.hasAttribute('ttp:tickRate')){
			tmpstr = root.getAttribute('ttp:tickRate');
			if(/\s*\d+\s*/.test(tmpstr)){
				tmpnum = parseInt(tmpstr);
				if(tmpnum !== 0){
					globals.tickRate = tmpnum;
					return;
				}
			}
		}
		if(root.hasAttribute('ttp:frameRate')){
			globals.tickRate = globals.effectiveFrameRate * globals.subFrameRate;
		}
	}
	
	function parse(input){
		var DOM = (new DOMParser).parseFromString(input,"application/xml"),
			headNodes = DOM.getElementsByTagName('head'),
			bodyNodes = DOM.getElementsByTagName('body'),
			cueList, globals = {
				frameRate: 30,
				effectiveFrameRate: 30,
				subFrameRate: 1,
				tickRate: 1
			};
		if(bodyNodes.length){
			parse_root_settings(DOM.documentElement, globals);
			if(headNodes.length){ parse_head(headNodes[0],globals); }
			cueList = parse_body(bodyNodes[0],globals);
		}else{ cueList = []; }
		return {
			cueList: cueList,
			kind: 'subtitles',
			lang: DOM.documentElement.getAttribute('xml:lang') || '',
			label: DOM.documentElement.getAttribute('xml:id') || ''
		};
	}	
	
	TimedText.registerType('application/ttml+xml', {
		extension: 'ttml',
		name: 'TTML',
		parse: parse,
		cueType: TTMLCue,
		isCueCompatible: function(cue){ return cue instanceof TTMLCue; },
		formatHTML: null,
		textFromHTML: null,
		serialize: function(track){
			return "<?xml version='1.0' encoding='UTF-8'?>"
				+ "<tt xmlns=\"http://www.w3.org/ns/ttml\" xml:id=\""+track.label+"\" xml:lang=\""+track.language+"\"><body><div>"
				+ [].map.call(track.cues,function(cue){ return serialize(cue); }).join('')
				+ "</div></body></tt>";
		}
	});
}());