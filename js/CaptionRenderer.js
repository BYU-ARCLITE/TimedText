(function(TimedText) {
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
	/* getDisplayMetrics(DOMNode)
		An object with the following properties:
			left: The calculated left offset of the display
			top: The calculated top offset of the display
			height: The calculated height of the display
			width: The calculated width of the display
	*/
	function getDisplayMetrics(renderer) {
		var UA, offsetObject = renderer.element,
			nodeComputedStyle = window.getComputedStyle(offsetObject,null),
			offsetTop = 0, offsetLeft = 0, controlHeight = 0;
		
		if (typeof renderer.controlHeight === 'number'){
			controlHeight = renderer.controlHeight;
		}else if (offsetObject.hasAttribute("controls")) {
			// Get heights of default control strip in various browsers
			// There could be a way to measure this live but I haven't thought/heard of it yet...
			UA = navigator.userAgent.toLowerCase();
			controlHeight =	(UA.indexOf("chrome") !== -1)?35:
							(UA.indexOf("opera") !== -1)?25:
							(UA.indexOf("firefox") !== -1)?28:
							(UA.indexOf("ie 9") !== -1)?44:
							(UA.indexOf("ipad") !== -1)?44:
							(UA.indexOf("safari") !== -1)?25:
							0;
		}
		
		while(offsetObject && offsetObject !== renderer.appendCueCanvasTo){
			offsetTop += offsetObject.offsetTop;
			offsetLeft += offsetObject.offsetLeft;
			offsetObject = offsetObject.offsetParent;
		}
	
		return {
			left: offsetLeft,
			top: offsetTop,
			width: parseInt(nodeComputedStyle.getPropertyValue("width"),10),
			height: parseInt(nodeComputedStyle.getPropertyValue("height"),10)-controlHeight
		};
	}
	
	function defaultRenderCue(renderedCue,area){
		var node, kind = renderedCue.kind;
		if(renderedCue.dirty){ renderedCue.cleanup(); }			
		if(kind === "chapters" || kind === "metadata"){ return; }
		node = document.createElement('div');
		node.appendChild(renderedCue.cue.getCueAsHTML());
		renderedCue.node = node;
	}
	
	/* applyStyles(DOMNode, Style Object)
		A fast way to apply multiple CSS styles to a DOMNode
		First parameter: DOMNode to style
		Second parameter: An object where the keys are camel-cased CSS property names
	*/
	function applyStyles(Node, styleObject) {
		var style = Node.style;
		Object.keys(styleObject).forEach(function(styleName){
			style[styleName] = styleObject[styleName];
		});
	}
	
	/* styleCueContainer(renderer)
		Styles and positions a div for displaying cues on a video.
	*/
	function styleCueContainer(renderer,videoMetrics) {
		var baseFontSize = Math.max(((videoMetrics.height * renderer.fontSizeRatio)/96)*72,renderer.minFontSize),
			baseLineHeight = Math.max(Math.floor(baseFontSize * renderer.lineHeightRatio),renderer.minLineHeight),
			styles = {
				"height": videoMetrics.height + "px",
				"width": videoMetrics.width + "px",
				"top": videoMetrics.top + "px",
				"left": videoMetrics.left + "px",
				"fontSize": baseFontSize + "pt",
				"lineHeight": baseLineHeight + "pt"
			};
	
		applyStyles(renderer.container,styles);
		if(renderer.showDescriptions){
			applyStyles(renderer.descriptor,styles);
		}
	}
	
	function defaultPosCue(rendered, availableCueArea, videoMetrics) {
		var DOMNode = rendered.node,
			cueObject = rendered.cue,
			cueX = 0, cueY = 0, cueWidth = 0, cueHeight = 0,
			baseFontSize, basePixelFontSize, baseLineHeight, pixelLineHeight;

		// Calculate font metrics
		baseFontSize = Math.max(((videoMetrics.height * 0.045)/96)*72, 10);
		basePixelFontSize = Math.floor((baseFontSize/72)*96);
		baseLineHeight = Math.max(Math.floor(baseFontSize * 1.2), 14);
		pixelLineHeight = Math.ceil((baseLineHeight/72)*96);
		
		if (pixelLineHeight * Math.floor(videoMetrics.height / pixelLineHeight) < videoMetrics.height) {
			pixelLineHeight = Math.floor(videoMetrics.height / Math.floor(videoMetrics.height / pixelLineHeight));
			baseLineHeight = Math.ceil((pixelLineHeight/96)*72);
		}
		
		
		cueWidth = availableCueArea.width;
		cueX = ((availableCueArea.right - cueWidth)/2) + availableCueArea.left;
		
		applyStyles(DOMNode,{
			display: "inline-block",
			position: "absolute",
			unicodeBidi: "plaintext",
			overflow: "hidden",
			height: pixelLineHeight + "px", //so the scrollheight has a baseline to work from
			width: cueWidth + "px",
			left: cueX + "px",
			padding: "0px " + Math.floor(videoMetrics.width/100) + "px",
			textAlign: "center",
			direction: TimedText.getTextDirection(DOMNode.textContent),
			lineHeight: baseLineHeight + "pt",
			boxSizing: "border-box"
		});	
		
		cueHeight = Math.round(DOMNode.scrollHeight/pixelLineHeight)*pixelLineHeight;
		cueY = availableCueArea.height + availableCueArea.top - cueHeight;
		DOMNode.style.height = cueHeight + "px";
		DOMNode.style.top = cueY + "px";
		
		// Work out how to shrink the available render area
		// If subtracting from the bottom works out to a larger area, subtract from the bottom.
		// Otherwise, subtract from the top.
		if ((cueY - 2*availableCueArea.top) >=
			(availableCueArea.bottom - (cueY + cueHeight)) &&
			availableCueArea.bottom > cueY) {
			availableCueArea.bottom = cueY;
		} else if (availableCueArea.top < cueY + cueHeight) {
			availableCueArea.top = cueY + cueHeight;
		}
		availableCueArea.height = availableCueArea.bottom - availableCueArea.top;
	}
	
	function defaultContentCheck(rendered){
		var prop, dirty = false,
			cue = rendered.cue,
			properties = rendered.properties;
		
		for(prop in cue){
			if(!cue.hasOwnProperty(prop)) { continue; }
			if(properties[prop] !== cue[prop]){
				properties[prop] = cue[prop];
				dirty = true;
			}
		}
		return dirty;	
	}
	
	function defaultKaraokeCheck(rendered, time){
		return false;
	}
	
	/*	RenderedCue(renderer, cue, track)
		Auxilliary object for keeping track of a cue that is currently active with a rendered representation.
		Provides the interface for interacting with custom render functions.
	*/
	function RenderedCue(renderer, cue, track){
		var type,
			posFn = defaultPosCue,
			timeFn = defaultKaraokeCheck,
			contFn = defaultContentCheck,
			editable = TimedText.isCueEditable(cue),
			node = null, gc = function(){};
		
		this.done = false;
		this.dirty = false;
		this.time = "";
		this.properties = {};
		this.autoPosition = track.kind !== "descriptions" && track.kind !== "metadata";
		
		type = TimedText.getCueTypeInfo(cue);
		if(type){
			posFn = type.positionCue || defaultPosCue;
			timeFn = type.updateCueTime || defaultKaraokeCheck;
			contFn = type.updateCueContent || defaultContentCheck;
		}
		
		this.positionCue = function(availableCueArea, videoMetrics){
			if(!this.autoPosition || !this.visible){ return; }
			posFn(this, availableCueArea, videoMetrics);
		};
		
		this.updateTime = function(time){
			if(!(this.node instanceof HTMLElement)){ return false; }
			return timeFn(this,time);
		};
		
		this.updateContent = function(){
			var dirty = contFn(this);
			this.dirty = dirty;
			return dirty;
		};
		
		Object.defineProperties(this,{
			cue: { get: function(){ return cue; }, enumerable: true },
			editable: { get: function(){ return editable; }, enumerable: true },
			renderer: { get: function(){ return renderer; }, enumerable: true },
			kind: { get: function(){ return track.kind; }, enumerable: true },
			mode: { get: function(){ return track.mode; }, enumerable: true },
			language: { get: function(){ return track.language; }, enumerable: true },
			trackLabel: { get: function(){ return track.label; }, enumerable: true },
			node: {
				set: function(nnode){
					if(node && node !== nnode && node.parentNode){
						node.parentNode.removeChild(node);
					}
					node = nnode instanceof HTMLElement?nnode:null;
					node.classList.add("caption-cue");
					return node;
				},
				get: function(){ return node; },
				enumerable: true
			},
			collector: {
				set: function(collector){
					gc = typeof collector === 'function'?collector:function(){};
					return gc;
				},
				get: function(){ return gc; },
				enumerable: true
			},
			visible: {
				get: function(){
					if(!this.node){ return false; }
					switch(this.node.parentNode){
					case renderer.container: return true;
					case renderer.descriptor: return renderer.showDescriptions;
					default: return false;
					}
				},
				enumerable: true
			}
		});
		
		this.updateContent();
	}

	RenderedCue.prototype.cleanup = function(){
		this.collector();
		if(this.node && this.node.parentNode){
			this.node.parentNode.removeChild(this.node);
		}
	};
	
	/* CaptionRenderer([dom element],
						[options - JS Object])
	
		Adds closed captions to video elements. The first, second and third parameter are both optional.
		First parameter: Use an array of either DOMElements or selector strings (compatible with querySelectorAll.)
		All of these elements will be captioned if tracks are available. If this parameter is omitted, all video elements
		present in the DOM will be captioned if tracks are available.
	*/
	function CaptionRenderer(element,options) {
		if(!(this instanceof CaptionRenderer)){ return new CaptionRenderer(element,options); }
		options = options instanceof Object? options : {};
		var media, renderer = this, internalTime = 0,
			timeupdate = function(){ renderer.currentTime = (media?media.currentTime:0) || 0; },
			container = document.createElement("div"),
			descriptor = document.createElement("div"),
			descriptorId = "description-display-"+(Math.random()*9999).toString(16),
			appendCueCanvasTo = (options.appendCueCanvasTo instanceof HTMLElement)?options.appendCueCanvasTo:document.body,
			renderCue = typeof options.renderCue === 'function'?options.renderCue:defaultRenderCue,
			showDescriptions = !!options.showDescriptions;

		container.className = "caption-cue-canvas";
		container.setAttribute("aria-live","off");
		
		descriptor.id = descriptorId;
		descriptor.className = "caption-desc-area";	
		descriptor.setAttribute("aria-live","assertive");
		
		appendCueCanvasTo.appendChild(container);
		appendCueCanvasTo.appendChild(descriptor);
		
		element.setAttribute("aria-describedby",element.hasAttribute("aria-describedby") ? element.getAttribute("aria-describedby") + " " + descriptorId : descriptorId);
		
		this.container = container;
		this.descriptor = descriptor;
		this.tracks = [];
		this.element = element;
		this.renderedCues = [];
		
		element.classList.add("captioned");
		
		window.addEventListener("resize", this.refreshLayout.bind(this) ,false);
		this.bindMediaElement = function(element) {
			if(media){ media.removeEventListener('timeupdate',timeupdate,false); }
			media = element;
			if(media){ media.addEventListener('timeupdate',timeupdate,false); }
		};
		
		Object.defineProperties(this,{
			currentTime: {
				get: function(){ return internalTime; },
				set: function(time){
					internalTime = +time || 0;
					// update active cues
					try{ this.tracks.forEach(function(track) { track.currentTime = internalTime; }); }
					catch(ignore) {}
					this.rebuildCaptions(false);
				},
				enumerable: true
			},
			appendCueCanvasTo: {
				get: function(){ return appendCueCanvasTo; },
				set: function(val){
					appendCueCanvasTo = (val instanceof HTMlElement)?val:null;
					this.refreshLayout();
					return appendCueCanvasTo;
				},
				enumerable: true
			},
			renderCue: {
				get: function(){ return renderCue; },
				set: function(val){
					renderCue = typeof val === 'function'?val:defaultRenderCue;
					this.refreshLayout();
					return renderCue;
				},
				enumerable: true
			},
			showDescriptions: {
				get: function(){ return showDescriptions; },
				set: function(val){
					val = !!val;
					if(showDescriptions !== val){
						showDescriptions = val;
						this.refreshLayout();
					}
					return showDescriptions;
				},
				enumerable: true				
			}
		});
	}
	
	CaptionRenderer.prototype.addTextTrack = function(kind,label,language) {
		var newTrack;
		if(kind instanceof TextTrack){
			newTrack = kind;
		}else{
			newTrack = new TextTrack(
			typeof kind === "string" ? kind : "",
			typeof label === "string" ? label : "",
			typeof language === "string" ? language : "");
			newTrack.readyState = TextTrack.LOADED;
		}
		if (newTrack) {
			this.tracks.push(newTrack);
			newTrack.renderer = this;
			return newTrack;
		}
		return null;			
	};
	
	function collectCues(tracks, fn){
		var activeCues = [];
		tracks.forEach(function(track) {
			if(track.mode === "disabled" || track.readyState !== TextTrack.LOADED){ return; }
			[].push.apply(activeCues,[].map.call(track.activeCues,fn.bind(null,track)));
		});
		return activeCues;
	}
	
	CaptionRenderer.prototype.rebuildCaptions = function(force) {
		var renderer = this,
			container = this.container,
			descriptor = this.descriptor,
			currentTime = this.currentTime,
			renderedCues = this.renderedCues,
			renderCue = this.renderCue,
			posBit = false, dirtyBit = force,
			area, activeCues, videoMetrics;
			
		if(force){
			//force re-render no matter what
			renderedCues.forEach(function(rendered){
				var node = rendered.node;
				if(node && node.parentNode){ node.parentNode.removeChild(node); }
			});
			activeCues = collectCues(this.tracks, function(track, cue){
				return new RenderedCue(renderer,cue,track);
			});
		}else{
			//find out if any cues are different
			activeCues = collectCues(this.tracks, function(track, cue){
				var i, cached;
				for(i=0;cached = renderer.renderedCues[i];i++){
					if(cached.cue === cue){
						dirtyBit = dirtyBit || cached.updateContent();
						if(!dirtyBit){
							posBit = posBit || cached.updateTime(currentTime);
						}
						return cached;
					}
				}
				dirtyBit = true;
				return new RenderedCue(renderer,cue,track);
			});
			
			renderedCues.forEach(function(old){
				//check for lapse to inactive status
				if(activeCues.some(function(rendered){ return rendered.cue === old.cue; })){ return; }
				posBit = true;
				
				old.cleanup();
				if(old.cue.pauseOnExit && this.media && typeof this.media.pause === 'function'){
					this.media.pause();
				}
			});
		}
		

		// If needed, redraw
		if(dirtyBit){
			container.style.opacity = 0;
			descriptor.style.opacity = 0;
			
			videoMetrics = getDisplayMetrics(this);
			styleCueContainer(this,videoMetrics);
			
			// Define storage for the available cue area, diminished as further cues are added
			// Cues occupy the largest possible area they can, either by width or height
			// (depending on whether the 'direction' of the cue is vertical or horizontal)
			// Cues which have an explicit position set do not detract from this area.
			area = {
				"top": 0, "left": 0,
				"bottom": videoMetrics.height,
				"right": videoMetrics.width,
				"height": videoMetrics.height,
				"width": videoMetrics.width
			};
			
			activeCues.forEach(function(rendered){
				var node, kind = rendered.kind;
				
				if(!rendered.done || rendered.dirty){
					renderCue(rendered,area,
						function(){ defaultRenderCue(rendered,area); });
					rendered.done = true;
					rendered.dirty = false;
					node = rendered.node;
						
					if(node === null){ return; }
						
					if(!node.hasAttribute('lang')){
						node.setAttribute('lang',rendered.language);
					}
					
					rendered.updateTime(currentTime);
					
					if(rendered.mode === "showing" && node.parentNode === null){
						if(kind === 'descriptions'){
							descriptor.appendChild(node);
						}else if(kind !== "chapters" && kind !== "metadata"){
							container.appendChild(node);
						}
					}
				}else if(rendered.node === null){ return; }
									
				rendered.positionCue(area,videoMetrics);
			});
		}else if(posBit){
			//just reposition things, in case the karaoke styling altered metrics or something disappeared
			container.style.opacity = 0;
			descriptor.style.opacity = 0;
			
			videoMetrics = getDisplayMetrics(this);
			styleCueContainer(this,videoMetrics);
			
			this.availableCueArea = {
				"top": 0, "left": 0,
				"bottom": videoMetrics.height,
				"right": videoMetrics.width,
				"height": videoMetrics.height,
				"width": videoMetrics.width
			};
			renderedCues.forEach(function(rendered){
				rendered.positionCue(area,videoMetrics);
			});
		}
		
		this.renderedCues = activeCues;
		container.style.opacity = 1;
		if(this.showDescriptions){
			descriptor.style.opacity = 1;
		}
	};
	
	CaptionRenderer.prototype.refreshLayout = function() {
		var renderer = this, area,
			container = this.container,
			descriptor = this.descriptor,
			currentTime = this.currentTime,
			videoMetrics = getDisplayMetrics(renderer),
			area = {
				"top": 0, "left": 0,
				"bottom": videoMetrics.height,
				"right": videoMetrics.width,
				"height": videoMetrics.height,
				"width": videoMetrics.width
			};

		// Get the canvas ready
		container.style.opacity = 0;
		descriptor.style.opacity = 0;
		styleCueContainer(this,videoMetrics);
	
		this.renderedCues.forEach(function(rendered) {
			rendered.updateTime(currentTime);
			rendered.updateContent();
			rendered.positionCue(area,videoMetrics);
		});
		container.style.opacity = 1;
		if(this.showDescriptions){
			descriptor.style.opacity = 1;
		}
	};
	
	/* processVideoElement(videoElement <HTMLVideoElement>,
						[options - JS Object])
	*/
	CaptionRenderer.prototype.processVideoElement = function(videoElement,options) {
		options = options instanceof Object? options : {};
		var renderer = this,
			trackList = this.tracks,
			language = navigator.language || navigator.userLanguage,
			defaultLanguage = options.language || language.split("-")[0],
			elements = [].slice.call(videoElement.querySelectorAll("track"),0);
		
		if(elements.length === 0){ return; }
		
		elements.forEach(function(trackElement) {
			var trackEnabled = false,
				sources = trackElement.querySelectorAll("source"),
				trackObject = new TextTrack(
							trackElement.getAttribute("kind"),
							trackElement.getAttribute("label"),
							trackElement.getAttribute("srclang").split("-")[0]);
			
			trackObject.loadTrack(sources.length > 0?sources:trackElement.getAttribute("src"));
			
			// Now determine whether the track is visible by default.
			// The comments in this section come straight from the spec...
			trackObject.internalDefault = trackElement.hasAttribute("default");			
			switch(trackObject.kind){
				// If the text track kind is subtitles or captions and the user has indicated an interest in having a track
				// with this text track kind, text track language, and text track label enabled, and there is no other text track
				// in the media element's list of text tracks with a text track kind of either subtitles or captions whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "subtitles":
				case "captions": if(options.enableCaptionsByDefault && defaultLanguage === trackObject.language) {
					trackEnabled = !trackList.some(function(track) {
						return	(track.kind === "captions" || track.kind === "subtitles") &&
								defaultLanguage === trackObject.language &&
								trackObject.mode === "showing";
					});
				}break;
				// If the text track kind is chapters and the text track language is one that the user agent has reason to believe is
				// appropriate for the user, and there is no other text track in the media element's list of text tracks with a text track
				// kind of chapters whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "chapters": if (defaultLanguage === trackObject.language) {
					trackEnabled = !trackList.filter(function(track) {
						return track.kind === "chapters" && track.mode === "showing";
					});
				}break;
				// If the text track kind is descriptions and the user has indicated an interest in having text descriptions
				// with this text track language and text track label enabled, and there is no other text track in the media element's
				// list of text tracks with a text track kind of descriptions whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "descriptions": if(options.enableDescriptionsByDefault && defaultLanguage === trackObject.language) {
					trackEnabled = !trackList.filter(function(track) {
						return track.kind === "descriptions" && track.mode === "showing";
					});
				}
			}
		
			// If there is a text track in the media element's list of text tracks whose text track mode is showing by default,
			// the user agent must furthermore change that text track's text track mode to hidden.
			trackEnabled && trackList.forEach(function(track) {
				if(track.internalDefault && trackObject.mode === "showing") {
					trackObject.mode = "hidden";
				}
			});
		
			// If the track element has a default attribute specified, and there is no other text track in the media element's
			// list of text tracks whose text track mode is showing or showing by default
			// Let the text track mode be showing by default.
			trackEnabled |= trackObject.internalDefault && !trackList.some(function(track) {
				return track.mode === "showing";
			});
	
			// Otherwise
			// Let the text track mode be disabled.
			trackObject.mode = trackEnabled?"showing":"disabled";
			trackObject.renderer = renderer;
			trackList.push(trackObject);
		});
		
		this.rebuildCaptions(false);
	};
	
	TimedText.CaptionRenderer = CaptionRenderer;
}(window.TimedText));