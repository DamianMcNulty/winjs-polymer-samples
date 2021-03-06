  (function() {

    function pivotDefaultHeaderTemplate(item) {
        var element = document.createTextNode(typeof item.header === "object" ? JSON.stringify(item.header) : ('' + item.header));
        return element;
    }

    var classNames = {
        pivot: "win-pivot",
        pivotLocked: "win-pivot-locked",
        pivotTitle: "win-pivot-title",
        pivotHeaders: "win-pivot-headers",
        pivotHeader: "win-pivot-header",
        pivotHeaderSelected: "win-pivot-header-selected",
        pivotViewport: "win-pivot-viewport",
        pivotSurface: "win-pivot-surface",
        pivotNoSnap: "win-pivot-nosnap",
        pivotNavButton: "win-pivot-navbutton",
        pivotNavButtonPrev: "win-pivot-navbutton-prev",
        pivotNavButtonNext: "win-pivot-navbutton-next",
        pivotShowNavButtons: "win-pivot-shownavbuttons",
    };

    var navigationModes = {
        api: "api",
        inertia: "inertia",
        none: "",
        scroll: "scroll",
    };
    var eventNames = {
        selectionChanged: "selectionchanged",
        itemAnimationStart: "itemanimationstart",
        itemAnimationEnd: "itemanimationend",
    };
    var MSManipulationEventStates = WinJS.Utilities._MSManipulationEvent;

    // Feature detection
    var supportsSnapPoints = !!WinJS.Utilities._browserStyleEquivalents["scroll-snap-type"];
    var supportsTouchDetection = !!(window.MSPointerEvent || window.TouchEvent);

    var PT_TOUCH = WinJS.Utilities._MSPointerEvent.MSPOINTER_TYPE_TOUCH || "touch";

    // Tab control which displays an item of content.
    Polymer('winjs-pivot', {

      created: function() {
        console.log("created winjs-pivot");
      },

      ready: function() {
        console.log("ready winjs-pivot");

        this.setAttribute('role', 'tablist');
        WinJS.Utilities.addClass(this, classNames.pivot);

        if (!supportsSnapPoints) {
            WinJS.Utilities.addClass(this, classNames.pivotNoSnap);
        }

        this._viewportElement = this.shadowRoot.querySelector("." + classNames.pivotViewport);
        this._surfaceElement = this.shadowRoot.querySelector("." + classNames.pivotSurface);
        this._headersContainerElement = this.shadowRoot.querySelector("." + classNames.pivotHeaders);

        if (supportsSnapPoints) {
            this._headersContainerElement.addEventListener('click', this._elementClickedHandler.bind(this));
        } else {
            WinJS.Utilities._addEventListener(this._headersContainerElement, "pointerenter", this._showNavButtons.bind(this));
            WinJS.Utilities._addEventListener(this._headersContainerElement, "pointerout", this._hideNavButtons.bind(this));
            WinJS.Utilities._addEventListener(this._headersContainerElement, "pointerdown", this._headersPointerDownHandler.bind(this));
            WinJS.Utilities._addEventListener(this._headersContainerElement, "pointerup", this._headersPointerUpHandler.bind(this));
        }


        this._viewportElement.addEventListener("scroll", this._scrollHandler.bind(this));
        this._viewportElement.addEventListener("MSManipulationStateChanged", this._MSManipulationStateChangedHandler.bind(this));

        // even though polymer provides a polyfill for pointer events, let's just use the one in WinJS
        WinJS.Utilities._addEventListener(this._viewportElement, "pointerdown", this._pointerDownHandler.bind(this));

        this._offsetFromCenter = 0;
        this._currentIndexOnScreen = 0;
        this._loadId = 0;
        this._navMode = navigationModes.none;
        this._currentManipulationState = MSManipulationEventStates.MS_MANIPULATION_STATE_STOPPED;
      },

      attached: function() {
        console.log("attached winjs-pivot");
      },

      domReady: function() {
        console.log("domReady winjs-pivot");

       this._parse();
       this._refresh();
      },

      detached: function() {
        console.log("detached winjs-pivot");
      },

      attributeChanged: function(attrName, oldVal, newVal) {
        //console.log("attributeChanged winjs-pivot: " + attrName, 'old: ' + oldVal, 'new:', newVal);
      },

      // Gets the DOM element that hosts the Pivot.
      get elementHost() {
        return this;
      },

      // Gets or sets a value that specifies whether the Pivot is locked to the current item.
      get locked() {
        return WinJS.Utilities.hasClass(this.elementHost, classNames.pivotLocked);
      },

      set locked(value) {
          WinJS.Utilities[value ? 'addClass' : 'removeClass'](this.elementHost, classNames.pivotLocked);
      },

      // Gets or sets the index of the item in view.
      get selectedIndex() {
        if (this._items.length === 0) {
            return -1;
        }

        if (+this._pendingIndexOnScreen === this._pendingIndexOnScreen) {
            return this._pendingIndexOnScreen;
        }

        return this._currentIndexOnScreen;
      },

      set selectedIndex(value) {
        if (value >= 0 && value < this._items.length) {
            if (this._pendingRefresh) {
                this._pendingIndexOnScreen = value;
            } else {
                this._navMode = this._navMode || navigationModes.api;
                this._loadItem(value);
            }
        }
      },

      // Gets or sets the item in view. This property is useful for restoring a previous view when your app launches or resumes.
      get selectedItem() {
        return this._items.getAt(this.selectedIndex);
      },

      set selectedItem (value) {
        var index = this._items.indexOf(value);
        if (index !== -1) {
            this.selectedIndex = index;
        }
      },
      
      // Gets or sets the WinJS.Binding.List of PivotItem objects that belong to this Pivot.
      get items() {
        if (this._pendingItems) {
            return this._pendingItems;
        }
        return this._items;
      },

      set items(value) {
          var resetScrollPosition = !this._pendingItems;
          this._pendingItems = value;
          this._refresh();
          if (resetScrollPosition) {
              this._pendingIndexOnScreen = 0;
          }
      },

      _elementClickedHandler: function pivot_elementClickedHandler(ev) {
        var header;

        if (this.locked) {
            return;
        }

        var src = ev.target;
        if (WinJS.Utilities.hasClass(src, classNames.pivotHeader)) {
            // UIA invoke clicks on the real header elements.
            header = src;
        } else {
            var hitSrcElement = false;
            var hitTargets = WinJS.Utilities._elementsFromPoint(ev.clientX, ev.clientY);
            if (hitTargets &&
                // Make sure there aren't any elements obscuring the Pivot headers.
                // WinJS.Utilities._elementsFromPoint sorts by z order.
                    hitTargets[0] === this._viewportElement) {
                for (var i = 0, len = hitTargets.length; i < len; i++) {
                    if (hitTargets[i] === src) {
                        hitSrcElement = true;
                    }
                    if (WinJS.Utilities.hasClass(hitTargets[i], classNames.pivotHeader)) {
                        header = hitTargets[i];
                    }
                }
            }

            if (!hitSrcElement) {
                // The click's coordinates and source element do not correspond so we
                // can't trust the coordinates. Ignore the click. This case happens in
                // clicks triggered by UIA invoke because UIA invoke uses the top left
                // of the window as the coordinates of every click.
                header = null;
            }
        }

        if (header) {
          this._activateHeader(header);
        }
      },

      _activateHeader: function pivot_activateHeader(headerElement) {
        if (this.locked) {
          return;
        }
        
        var index = this._items.indexOf(headerElement._item);
        if (index !== this.selectedIndex) {
          if (!headerElement.previousSibling) {
            // prevent clicking the previous header
            return;
          }
          this.selectedIndex = index;
        } else {
          // Move focus into content for Narrator.
          WinJS.Utilities._setActiveFirstFocusableElement(this.selectedItem.element);
        }
      },
      
      _recenterUI: function pivot_recenterUI() {
          if (!supportsSnapPoints) {
            return;
          }

          this._offsetFromCenter = 0;

          if (this._viewportElement.scrollLeft !== this._currentScrollTargetLocation) {
              // If recentering causes a scroll, then we need to make sure that the next
              // scroll event event doesn't trigger another navigation
              this._recentering = true;
          } else if (this._stoppedAndRecenteredSignal) {
              this._stoppedAndRecenteredSignal.complete();
              this._stoppedAndRecenteredSignal = null;
          }
          if (this.selectedItem) {
              this.selectedItem.elementHost.style[this._getDirectionAccessor()] = this._currentScrollTargetLocation + 'px';
          }
          //console.log('_recenterUI index:' + this.selectedIndex + ' offset: ' + this._offsetFromCenter + ' scrollLeft: ' + this._currentScrollTargetLocation);
          this._viewportElement.scrollLeft = this._currentScrollTargetLocation;
      },

      get _currentScrollTargetLocation() {
        // 49 pages before + current one is 50. There are also 50 afterwards.
        return (50 + this._offsetFromCenter) * Math.ceil(this._viewportWidth);
      },

      get _viewportWidth() {
        if (!this._viewportElWidth) {
            this._viewportElWidth = parseFloat(getComputedStyle(this._viewportElement).width);
            var snapPointsXInfo = WinJS.Utilities._browserStyleEquivalents["scroll-snap-points-x"];
            if (snapPointsXInfo) {
              this._viewportElement.style[snapPointsXInfo.scriptName] = "snapInterval(0%, " + Math.ceil(this._viewportElWidth) + "px)";
            }
        }
        return this._viewportElWidth || 1;
      },

      set _viewportWidth(value) {
        this._viewportElWidth = value;
      },
      
      get _rtl() {
        return this._cachedRTL;
      },

      _getDirectionAccessor: function () {
        return this._rtl ? "right" : "left";
      },

      _showNavButtons: function pivot_showNavButtons(e) {
          if (e.pointerType === PT_TOUCH) {
              return;
          }
          this._headersContainerElement.classList.add(classNames.pivotShowNavButtons);
      },

      _hideNavButtons: function pivot_hideNavButtons(e) {
          if (this._headersContainerElement.contains(e.relatedTarget)) {
              // Don't hide the nav button if the pointerout event is being fired from going
              // from one element to another within the header track.
              return;
          }

          this._headersContainerElement.classList.remove(classNames.pivotShowNavButtons);
      },

      _hidePivotItem: function pivot_hidePivotItem(element, goPrevious) {
        var that = this;
        function cleanup() {
            that._hidePivotItemAnimation = null;
            element.style.visibility = "hidden";
            element.style.opacity = 0;
        }

        var negativeTransform = (this._rtl && !goPrevious) || (goPrevious && !this._rtl);
        
        this._hidePivotItemAnimation = WinJS.UI.Animation[negativeTransform ? "slideRightOut" : "slideLeftOut"](element);
        this._hidePivotItemAnimation.then(cleanup, cleanup);
      },

      _showPivotItem: function pivot_showPivotItem(element, goPrevious) {
          // Fire the event even if animations are disabled to enable apps to know what is happening
          this._fireEvent(eventNames.itemAnimationStart, true);

          // Find the elements to slide in
          var slideGroup1Els = element.querySelectorAll(".win-pivot-slide1");
          var slideGroup2Els = element.querySelectorAll(".win-pivot-slide2");
          var slideGroup3Els = element.querySelectorAll(".win-pivot-slide3");

          var viewportBoundingClientRect = this._viewportElement.getBoundingClientRect();
          function filterOnScreen(element) {
              var elementBoundingClientRect = element.getBoundingClientRect();
              // Can't check left/right since it might be scrolled off.
              return elementBoundingClientRect.top < viewportBoundingClientRect.bottom &&
                  elementBoundingClientRect.bottom > viewportBoundingClientRect.top;
          }

          //Filter the slide groups to the elements actually on screen to avoid animating extra elements
          slideGroup1Els = Array.prototype.filter.call(slideGroup1Els, filterOnScreen);
          slideGroup2Els = Array.prototype.filter.call(slideGroup2Els, filterOnScreen);
          slideGroup3Els = Array.prototype.filter.call(slideGroup3Els, filterOnScreen);

          var negativeTransform = (this._rtl && !goPrevious) || (goPrevious && !this._rtl);
          element.style.visibility = "";

          this._showPivotItemAnimation = WinJS.UI.Animation[negativeTransform ? "slideRightIn" : "slideLeftIn"](element, slideGroup1Els, slideGroup2Els, slideGroup3Els);

          var that = this;
          function showCleanup() {
              that._showPivotItemAnimation = null;
          }

          this._showPivotItemAnimation.then(showCleanup, showCleanup);

          return this._showPivotItemAnimation;
      },

      _scrollHandler: function pivot_scrollHandler() {
        if (this._disposed || !supportsSnapPoints) {
          return;
        }

        if (this._recentering && this._stoppedAndRecenteredSignal) {
            this._stoppedAndRecenteredSignal.complete();
            this._stoppedAndRecenteredSignal = null;
            this._recentering = false;
            return;
        }

        if ((this._navMode === navigationModes.none || this._navMode === navigationModes.scroll)
                && this._currentManipulationState === MSManipulationEventStates.MS_MANIPULATION_STATE_STOPPED) {

            this._navMode = navigationModes.scroll;
            WinJS.log && WinJS.log('_scrollHandler ScrollPosition: ' + this._viewportElement.scrollLeft, "winjs pivot", "log");
            // Check if narrator user panned/scrolled the Pivot and we are now at an unsupported location.
            var diff = this._viewportElement.scrollLeft - this._currentScrollTargetLocation;
            this._cachedRTL = getComputedStyle(this.elementHost, null).direction === "rtl";
            if (diff > 10) {
                WinJS.log && WinJS.log('_scrollHandler diff > 1: ' + diff, "winjs pivot", "log");
                this._goNext();
            } else if (diff < -10) {
                WinJS.log && WinJS.log('_scrollHandler diff < -1: ' + diff, "winjs pivot", "log");
                this._goPrevious();
            }
        }
      },

      _MSManipulationStateChangedHandler: function pivot_MSManipulationStateChangedHandler(ev) {
          this._currentManipulationState = ev.currentState;
          if (!supportsSnapPoints || ev.target !== this._viewportElement) {
              // Ignore sub scroller manipulations.
              return;
          }
          if (this._currentManipulationState === MSManipulationEventStates.MS_MANIPULATION_STATE_STOPPED) {
              WinJS.log && WinJS.log('MSManipulation: Stopped', "winjs pivot", "log");
          } else if (this._currentManipulationState === MSManipulationEventStates.MS_MANIPULATION_STATE_INERTIA) {
              WinJS.log && WinJS.log('MSManipulation: Inertia', "winjs pivot", "log");
          } else {
              WinJS.log && WinJS.log('MSManipulation: Active', "winjs pivot", "log");
          }

          if (!this._stoppedAndRecenteredSignal) {
              this._stoppedAndRecenteredSignal = new WinJS._Signal();
          }

          this._manipulationRecenterPromise && this._manipulationRecenterPromise.cancel();

          if (this._currentManipulationState === MSManipulationEventStates.MS_MANIPULATION_STATE_STOPPED) {
              this._navMode = navigationModes.none;
              this._scrollHandler();

              var that = this;
              this._manipulationRecenterPromise = WinJS.Promise._cancelBlocker(
                  WinJS.Promise.join([
                      WinJS.Utilities.Scheduler.schedulePromiseNormal(null, "WinJS.UI.Pivot._MSManipulationStateChangedHandler_animationPlaceholder"),
                      this._hidePivotItemAnimation,
                      this._showPivotItemAnimation,
                      this._slideHeadersAnimation
                  ])
              ).then(function () {
                  if (that._disposed) {
                      return;
                  }
                  if (that._currentManipulationState === MSManipulationEventStates.MS_MANIPULATION_STATE_STOPPED) {
                      // If we are still "stopped" we should recenter.
                      WinJS.log && WinJS.log('Still in Stopped state: calling _recenterUI', "winjs pivot", "log");
                      that._recenterUI();
                  } else {
                      this._stoppedAndRecenteredSignal.complete();
                      this._stoppedAndRecenteredSignal = null;
                  }
              });
          } else if (this._currentManipulationState === MSManipulationEventStates.MS_MANIPULATION_STATE_INERTIA) {
              var destinationX = ev.inertiaDestinationX;
              if (+destinationX === destinationX) {
                  WinJS.log && WinJS.log('MSManipulation: inertiaDestinationX: ' + destinationX);
                  var diff = destinationX - this._currentScrollTargetLocation;
                  if (diff > 1) {
                      WinJS.log && WinJS.log('MSManipulation: Inertia diff > 1', "winjs pivot", "log");
                      this._navMode = navigationModes.inertia;
                      this._goNext();
                  } else if (diff < -1) {
                      WinJS.log && WinJS.log('MSManipulation: Stopped diff < -1', "winjs pivot", "log");
                      this._navMode = navigationModes.inertia;
                      this._goPrevious();
                  }
              }
          }
      },

      _pointerDownHandler: function pivot_pointerDownHandler(ev) {
          WinJS.log && WinJS.log('_pointerDown', "winjs pivot", "log");
          // Don't do recentering if a finger is down.
          this._manipulationRecenterPromise && this._manipulationRecenterPromise.cancel();
          // If another finger comes down stop animations.
          this._slideHeadersAnimation && this._slideHeadersAnimation.cancel();
          this._hidePivotItemAnimation && this._hidePivotItemAnimation.cancel();
      },

      _parse: function pivot_parse() {
          var pivotItems = []
          var pivotItemEl = this.firstElementChild;

          while (pivotItemEl) {
              WinJS.UI.process(pivotItemEl);

              if (pivotItemEl.tagName.toLowerCase() === "winjs-pivot-item") {
                  pivotItems.push(pivotItemEl);
              } else {
                  throw new WinJS.ErrorFromName("WinJS.UI.Pivot.InvalidContent", "InvalidContent");
              }

              var nextItemEl = pivotItemEl.nextElementSibling;
              pivotItemEl = nextItemEl;
          }

          this.items = new WinJS.Binding.List(pivotItems);
      },

      _goPrevious: function pivot_goPrevious() {
          this._animateToPrevious = true;
          if (this.selectedIndex > 0) {
              this.selectedIndex--;
          } else {
              this.selectedIndex = this._items.length - 1;
          }
          this._animateToPrevious = false;
      },

      _goNext: function pivot_goNext() {
          if (this.selectedIndex < this._items.length - 1) {
              this.selectedIndex++;
          } else {
              this.selectedIndex = 0;
          }
      },

      _fireEvent: function pivot_fireEvent(type, canBubble, cancelable, detail) {
          // Returns true if ev.preventDefault() was not called
          var event = document.createEvent("CustomEvent");
          event.initCustomEvent(type, !!canBubble, !!cancelable, detail);

          // equivalent to polymer's fire method
          return this.elementHost.dispatchEvent(event);
      },

      _renderHeaders: function pivot_renderHeaders(goPrevious) {
          if (this._pendingRefresh || !this._items) {
              return;
          }

          var template = WinJS.Utilities._syncRenderer(pivotDefaultHeaderTemplate);

          WinJS.Utilities.empty(this._headersContainerElement);

          var that = this;
          function renderHeader(index) {
            var item = that._items.getAt(index);

            var headerContainerEl = document.createElement("BUTTON");
            if (index === that.selectedIndex) {
                WinJS.Utilities.addClass(headerContainerEl, classNames.pivotHeaderSelected);
                headerContainerEl.setAttribute('aria-selected', true);
            } else {
                headerContainerEl.setAttribute('aria-selected', false);
            }
            WinJS.Utilities.addClass(headerContainerEl, classNames.pivotHeader);
            headerContainerEl._item = item;
            template(item, headerContainerEl)
            headerContainerEl.setAttribute('role', 'tab');
            that._headersContainerElement.appendChild(headerContainerEl);

            function ariaSelectedMutated() {
                if (that._disposed) {
                    return;
                }

                if (that._headersContainerElement.contains(headerContainerEl) &&
                    index !== that.selectedIndex &&
                    headerContainerEl.getAttribute('aria-selected') === "true") {
                    // Ignore aria selected changes on selected item.
                    // By selecting another tab we change to it.
                    that.selectedIndex = index;
                }
            }

            new WinJS.Utilities._MutationObserver(ariaSelectedMutated).observe(headerContainerEl, { attributes: true, attributeFilter: ["aria-selected"] });
          }

          if (this._items.length === 1) {
              renderHeader(0);
              this._viewportElement.style.overflow = "hidden"
              this._headersContainerElement.style.marginLeft = "0px";
              this._headersContainerElement.style.marginRight = "0px";
          } else if (this._items.length > 1) {
              // We always render 1 additional header before the current item.
              // When going backwards, we render 2 additional headers, the first one as usual, and the second one for
              // fading out the previous last header.
              var numberOfHeadersToRender = this._items.length + (goPrevious ? 2 : 1);
              var indexToRender = this.selectedIndex - 1;

              if (this._viewportElement.style.overflow) {
                  this._viewportElement.style.overflow = "";
              }

              for (var i = 0; i < numberOfHeadersToRender; i++) {
                if (indexToRender === -1) {
                    indexToRender = this._items.length - 1;
                } else if (indexToRender === this._items.length) {
                    indexToRender = 0;
                }

                renderHeader(indexToRender);
                indexToRender++;
              }
              if (!this._skipHeaderSlide) {
                var start, end;
                if (goPrevious) {
                    start = "";
                    end = "0";
                } else {
                    start = "0";
                    end = "";
                }

                var lastHeader = this._headersContainerElement.children[numberOfHeadersToRender - 1];
                lastHeader.style.opacity = start;
                var lastHeaderFadeInDuration = 0.167;
                lastHeader.style[WinJS.Utilities._browserStyleEquivalents["transition"].scriptName] = "opacity " + WinJS.UI._animationTimeAdjustment(lastHeaderFadeInDuration) + "s";
                getComputedStyle(lastHeader).opacity;
                lastHeader.style.opacity = end;
              }

              this._headersContainerElement.children[0].setAttribute("aria-hidden", "true");
              this._headersContainerElement.style.marginLeft = "0px";
              this._headersContainerElement.style.marginRight = "0px";
              var leadingMargin = this._rtl ? "marginRight" : "marginLeft";
              var trailingPadding = this._rtl ? "paddingLeft" : "paddingRight";
              var firstHeader = this._headersContainerElement.children[0];
              var leadingSpace = firstHeader.offsetWidth + parseFloat(getComputedStyle(firstHeader)[leadingMargin]) - parseFloat(getComputedStyle(firstHeader)[trailingPadding]);
              if (firstHeader !== this._headersContainerElement.children[0]) {
                  // Calling offsetWidth caused a layout which can trigger a synchronous resize which in turn
                  // calls renderHeaders. We can ignore this one since its the old headers which are not in the DOM.
                  return;
              }
              this._headersContainerElement.style[leadingMargin] = (-1 * leadingSpace) + "px";

              if (!supportsSnapPoints) {
                  // Create header track nav button elements
                  this._prevButton = document.createElement("button");
                  this._prevButton.classList.add(classNames.pivotNavButton);
                  this._prevButton.classList.add(classNames.pivotNavButtonPrev);
                  this._prevButton.addEventListener("click", function () {
                      that._goPrevious();
                  });
                  this._headersContainerElement.appendChild(this._prevButton);
                  // Left is NOT 0px since the header track has a negative leading space for the previous header
                  this._prevButton.style.left = leadingSpace + "px";

                  this._nextButton = document.createElement("button");
                  this._nextButton.classList.add(classNames.pivotNavButton);
                  this._nextButton.classList.add(classNames.pivotNavButtonNext);
                  this._nextButton.addEventListener("click", function () {
                      that._goNext();
                  });
                  this._headersContainerElement.appendChild(this._nextButton);
                  this._nextButton.style.right = "0px";
              }
          }
      },

      _headersPointerDownHandler: function pivot_headersPointerDownHandler(e) {
          // This prevents Chrome's history navigation swipe gestures.
          e.preventDefault();

          this._headersPointerDownPoint = { x: e.clientX, y: e.clientY, type: e.pointerType || "mouse" };
      },

      _headersPointerUpHandler: function pivot_headersPointerUpHandler(e) {
          if (!this._headersPointerDownPoint) {
              return;
          }

          var dx = e.clientX - this._headersPointerDownPoint.x;
          var dy = e.clientY - this._headersPointerDownPoint.y;
          if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
              // Detect header click
              var element = e.target;
              // while (element !== null && !element.classList.contains(classNames.pivotHeaders)) {
              //     element = element.parentElement;
              // }
              if (element !== null) {
                  this._activateHeader(element);
              }
          } else if ((!supportsTouchDetection || (this._headersPointerDownPoint.type === e.pointerType && e.pointerType === PT_TOUCH)) && Math.abs(dy) < 50) {
              // Header swipe navigation detection
              // If touch detection is not supported then we will detect swipe gestures for any pointer type.
              if (dx < -50) {
                  if (this._rtl) {
                      this._goPrevious();
                  } else {
                      this._goNext();
                  }
              } else if (dx > 50) {
                  if (this._rtl) {
                      this._goNext();
                  } else {
                      this._goPrevious();
                  }
              }
          }
          this._headersPointerDownPoint = null;
      },

      _refresh: function pivot_refresh() {
        if (this._pendingRefresh) {
          return;
        }

        // This is to coalesce property setting operations such as items and scrollPosition.
        this._pendingRefresh = true;

        WinJS.Utilities.Scheduler.schedule(this._applyProperties.bind(this), WinJS.Utilities.Scheduler.Priority.high);       
      },

      _applyProperties: function pivot_applyProperties() {
          this._pendingRefresh = false;

          if (this._pendingItems) {
            this._items = this._pendingItems;
            this._pendingItems = null;
          }

          this._configureItems();

          var pendingIndexOnScreen = this._pendingIndexOnScreen;
          this._pendingIndexOnScreen = null;
          this._currentIndexOnScreen = 0;
          this._skipHeaderSlide = true;
          this.selectedIndex = Math.min(pendingIndexOnScreen, this._items.length - 1);
          this._skipHeaderSlide = false;
          this._recenterUI();
      },

      _configureItems: function pivot_configureItems() {
        this._measured = false;
        for (var i = 0, len = this._items.length; i < len; i++) {
            var item = this._items.getAt(i);
            item.elementHost.style.visibility = "hidden";
            item.elementHost.style.opacity = 0;
        }
      },

      _slideHeaders: function pivot_slideHeaders(goPrevious, index, oldIndex) {
        if (index < 0 || this._skipHeaderSlide) {
            this._renderHeaders(goPrevious);
            return;
        }

        var targetHeader;

        if (goPrevious) {
            targetHeader = this._headersContainerElement.children[0];
        } else {
            if (index < oldIndex) {
                index += this._items.length;
            }
            targetHeader = this._headersContainerElement.children[1 + index - oldIndex]
        }

        if (!targetHeader) {
            this._renderHeaders(goPrevious);
            return;
        }

        // Update the selected one:
        WinJS.Utilities.removeClass(this._headersContainerElement.children[1], classNames.pivotHeaderSelected);
        WinJS.Utilities.addClass(targetHeader, classNames.pivotHeaderSelected);

        var rtl = this._rtl;

        function offset(element) {
          if (rtl) {
              return element.offsetParent.offsetWidth - element.offsetLeft - element.offsetWidth;
          } else {
              return element.offsetLeft;
          }
        }

        var endPosition = offset(this._headersContainerElement.children[1]) - offset(targetHeader);
        if (rtl) {
            endPosition *= -1;
        }

        var that = this;
        function headerCleanup() {
          if (that._disposed) {
              return;
          }

          that._renderHeaders(goPrevious);
          that._slideHeadersAnimation = null;
        }

        var headerAnimation;
        if (WinJS.UI.isAnimationEnabled()) {
          headerAnimation = WinJS.UI.executeTransition(
          this._headersContainerElement.querySelectorAll("." + classNames.pivotHeader),          {
              property: WinJS.Utilities._browserStyleEquivalents["transform"].cssName,
              delay: 0,
              duration: 250,
              timing: "ease-out",
              to: "translateX(" + endPosition + "px)"
          });
        } else {
            headerAnimation = WinJS.Promise.wrap();
        }

        this._slideHeadersAnimation = headerAnimation.then(headerCleanup, headerCleanup);
      },

      _loadItem: function pivot_loadItem(index) {
        var goPrevious = this._animateToPrevious;
        this._cachedRTL = getComputedStyle(this.elementHost, null).direction === "rtl";
        this._loadId++;
        var loadId = this._loadId;

        this._hidePivotItemAnimation && this._hidePivotItemAnimation.cancel();
        this._showPivotItemAnimation && this._showPivotItemAnimation.cancel();
        this._slideHeadersAnimation && this._slideHeadersAnimation.cancel();

        if (this._currentItem) {
            // Hide existing item
            this._hidePivotItem(this._currentItem.elementHost, goPrevious);
        }

        var oldIndex = this._currentIndexOnScreen;
        this._currentIndexOnScreen = index;
        this._slideHeaders(goPrevious, index, oldIndex);

        if (index < 0) {
            return;
        }

        // Get next item
        var item = this._items.getAt(index);
        this._currentItem = item;

        if (goPrevious) {
            this._offsetFromCenter--;
        } else if (index !== oldIndex) {
            this._offsetFromCenter++;
        }

        if (supportsSnapPoints && this._currentManipulationState !== MSManipulationEventStates.MS_MANIPULATION_STATE_INERTIA) {
            if (this._skipHeaderSlide) {
                WinJS.log && WinJS.log('_skipHeaderSlide index:' + this.selectedIndex + ' offset: ' + this._offsetFromCenter + ' scrollLeft: ' + this._currentScrollTargetLocation, "winjs pivot", "log");
                this._viewportElement.scrollLeft = this._currentScrollTargetLocation;
            } else {
                WinJS.log && WinJS.log('zoomTo index:' + this.selectedIndex + ' offset: ' + this._offsetFromCenter + ' scrollLeft: ' + this._currentScrollTargetLocation, "winjs pivot", "log");
                WinJS.Utilities._zoomTo(this._viewportElement, { contentX: this._currentScrollTargetLocation, contentY: 0, viewportX: 0, viewportY: 0 });
            }
        }

        var that = this;
        var eventFired = false;
        var selectionChangedDetail = {
            index: index,
            direction: goPrevious ? "backwards" : "forward",
            item: item
        };

        this._fireEvent(eventNames.selectionChanged, true, false, selectionChangedDetail);

        // Start it hidden until it is loaded
        item._process().then(function () {
            if (loadId === that._loadId) {
                if (supportsSnapPoints) {
                  // Position item:
                  item.elementHost.style[that._getDirectionAccessor()] = that._currentScrollTargetLocation + "px";

                  that._showPivotItem(item.elementHost, goPrevious);
                } else {
                  // Since we aren't msZoomTo'ing when snap points aren't supported, both the show and hide animations would be
                  // executing on top of each other which produces undesirable visuals. Here we wait for the hide to finish before showing.
                  if (that._hidePivotItemAnimation) {
                      that._showPivotItemAnimation = that._hidePivotItemAnimation.then(function () {
                          return that._showPivotItem(item.elementHost, goPrevious);
                      });
                  } else {
                      // During the very first load, there is no hide animation, we can just show the pivot item immediately.
                      that._showPivotItem(item.elementHost, goPrevious);

                  }
                }

                WinJS.Promise.join([that._slideHeadersAnimation, that._showPivotItemAnimation, that._hidePivotItemAnimation]).then(function () {
                    (that._stoppedAndRecenteredSignal ? that._stoppedAndRecenteredSignal.promise : WinJS.Promise.wrap()).then(function () {
                        WinJS.Promise.timeout(50).then(function () {
                            if (loadId === that._loadId) {
                                that._navMode = navigationModes.none;

                                // Fire event even if animation didn't occur:
                                that._fireEvent(eventNames.itemAnimationEnd, true);
                            }
                        });
                    });
                });
            }
        });
      },
    });

  })();
