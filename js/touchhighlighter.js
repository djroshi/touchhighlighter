(function($, window, document, undefined) {
    var nodeTypes = {
        ELEMENT_NODE: 1,
        TEXT_NODE: 3
    };

    // Don't highlight content of these tags
    var ignoreTags = ['SCRIPT', 'STYLE', 'SELECT', 'BUTTON', 'OBJECT', 'APPLET'];

    var plugin = {
        name: 'touchHighlighter'
    };

    /**
     * Wrap each textNode in a span element to locate touch events
     */
    $.fn.wrapTextNodes = function(touchClass) {
        this.contents().each(function() {
            if ($.inArray(this.tagName, ignoreTags) != -1) return this;
            if (this.nodeType === nodeTypes.TEXT_NODE) {
                var span = this.textContent.replace(/\S+/g, function (word) {
                    return '<span class="' + touchClass + '">' + word + '</span>';
                });
                $(this).replaceWith(span);
            } else {
                return $(this).wrapTextNodes(touchClass);
            }
        });
        return this;
    }

    /**
     * Remove touch event wrappers
     */
    $.fn.unwrapTextNodes = function(touchClass) {
        return this.find('span.' + touchClass).each(function() {
            $(this).contents().unwrap();
        });
    }

    function TouchHighlighter(element, options) {
        this.touches = {};
        this.context = element;
        this.$context = $(element);
        this.options = $.extend({}, $[plugin.name].defaults, options);
        this.init();
    }

    TouchHighlighter.prototype = {
        init: function() {
            this.$context.addClass(this.options.contextClass);
            this.$context.wrapTextNodes(this.options.touchClass);
            this.bindEvents();
        },

        destroy: function() {
            this.unbindEvents();
            this.$context.unwrapTextNodes(this.options.touchClass);
            this.$context.removeClass(this.options.contextClass);
            this.$context.removeData(plugin.name);
        },

        bindEvents: function() {
            this.$context.bind('mouseup', {self: this}, this.highlightHandler);
            this.$context.bind('touchstart', {self: this}, this.touchHandler);
            this.$context.bind('touchend', {self: this}, this.touchHandler);
        },

        unbindEvents: function() {
            this.$context.unbind('mouseup', this.highlightHandler);
            this.$context.unbind('touchstart', this.touchHandler);
            this.$context.unbind('touchend', this.touchHandler);
        },

        highlightHandler: function(event) {
            var self = event.data.self;

            if (self.options.disabled) {
                return;
            }

            self.doHighlight();
        },

        touchHandler: function(event) {
            var self = event.data.self;

            if (self.options.disabled) {
                return;
            }
         
            var touchList = event.originalEvent.changedTouches;
            var preventDefault = self.options.preventDefault;
            
            for (var i = 0; i < touchList.length; i++) {
                if (self.isHighlight(touchList[i].target) || self.isHighlight(touchList[i].target.parentNode)) continue;

                var id = touchList[i].identifier;
                if (typeof self.touches[id] === 'undefined') {
                    if (event.type !== 'touchstart') continue;
                    self.touches[id] = {};
                }
                self.touches[id][event.type] = { 
                    x: touchList[i].pageX,
                    y: touchList[i].pageY
                };
                var target = $.nearest(self.touches[id][event.type], 'span.' + self.options.touchClass);
                self.touches[id][event.type]['target'] = target[0];
                if (event.type === 'touchend') {
                    if (self.options.allowVerticalScroll) {
                        var x = Math.abs(self.touches[id].touchstart.x - self.touches[id].touchend.x);
                        var y = Math.abs(self.touches[id].touchstart.y - self.touches[id].touchend.y);
                        if (x < y) {
                            preventDefault = false;
                        } else {
                            self.doTouchHighlight(self.touches[id]);
                        }
                    }
                }
            }

            if (preventDefault) {
                event.preventDefault();
            }
        },

        doTouchHighlight: function(touch) {
            var range = rangy.createRange();
            range.setStartBefore(touch.touchstart.target);
            range.setEndAfter(touch.touchend.target);
            this.doHighlight(range);
        },

        doHighlight: function(range) {
            if (range) this.removeAllRanges();
            if (!range) var range = this.getCurrentRange();
            if (!range || range.collapsed) return;
            var rangeText = range.toString();

            if (this.options.onBeforeHighlight(range) == true) {
                var $wrapper = $.touchHighlighter.createWrapper(this.options);

                var createdHighlights = this.highlightRange(range, $wrapper);
                var normalizedHighlights = this.normalizeHighlights(createdHighlights);

                this.options.onAfterHighlight(normalizedHighlights, rangeText);
            }

            this.removeAllRanges();
        },

        /**
         * Returns first range of current selection object.
         */
        getCurrentRange: function() {
            var selection = this.getCurrentSelection();

            var range;
            if (selection.rangeCount > 0) {
                range = selection.getRangeAt(0);
            }
            return range;
        },

        removeAllRanges: function() {
            var selection = this.getCurrentSelection();
            selection.removeAllRanges();
        },

        /**
         * Returns current selection object.
         */
        getCurrentSelection: function() {
            var currentWindow = this.getCurrentWindow();
            var selection;

            if (currentWindow.getSelection) {
                selection = currentWindow.getSelection();
            } else if ($('iframe').length) {
                $('iframe', top.document).each(function() {
                    if (this.contentWindow === currentWindow) {
                        selection = rangy.getIframeSelection(this);
                        return false;
                    }
                });
            } else {
                selection = rangy.getSelection();
            }

            return selection;
        },

        /**
         * Returns owner window of this.context.
         */
        getCurrentWindow: function() {
            var currentDoc = this.getCurrentDocument();
            if (currentDoc.defaultView) {
                return currentDoc.defaultView; // Non-IE
            } else {
                return currentDoc.parentWindow; // IE
            }
        },

        /**
         * Returns owner document of this.context.
         */
        getCurrentDocument: function() {
            // if ownerDocument is null then context is document
            return this.context.ownerDocument ? this.context.ownerDocument : this.context;
        },

        /**
         * Wraps given range (highlight it), in the given wrapper.
         */
        highlightRange: function(range, $wrapper) {
            if (range.collapsed) return;

            var startContainer = range.startContainer;
            var endContainer = range.endContainer;

            var goDeeper = true;
            var done = false;
            var node = startContainer;
            var highlights = [];

            do {
                if (goDeeper && node.nodeType == nodeTypes.TEXT_NODE) {
                    if (/\S/.test(node.nodeValue)) {
                        var wrapper = $wrapper.clone(true).get(0);
                        var nodeParent = node.parentNode;

                        // highlight if node is inside the context
                        if ($.contains(this.context, nodeParent) || nodeParent === this.context) {
                            //var highlight = $(node).wrap(wrapper).parent().get(0);
                            var highlight = $(nodeParent).wrap(wrapper).parent().get(0);
                            highlights.push(highlight);
                        }
                    }

                    goDeeper = false;
                }
                if (node == endContainer && (!endContainer.hasChildNodes() || !goDeeper)) {
                    done = true;
                }

                if ($.inArray(node.tagName, ignoreTags) != -1) {
                    goDeeper = false;
                }
                if (goDeeper && node.hasChildNodes()) {
                    node = node.firstChild;
                } else if (node.nextSibling != null) {
                    node = node.nextSibling;
                    goDeeper = true;
                } else {
                    node = node.parentNode;
                    goDeeper = false;
                }
            } while (!done);

            return highlights;
        },

        /**
         * Normalizes highlights - nested highlights are flattened and sibling higlights are merged.
         */
        normalizeHighlights: function(highlights) {
            this.flattenNestedHighlights(highlights);

            if (this.options.mergeHighlights) {
                this.mergeSiblingHighlights(highlights);
            }

            // omit removed nodes
            var normalizedHighlights = $.map(highlights, function(hl) {
                if (typeof hl.parentElement != 'undefined') { // IE
                    return hl.parentElement != null ? hl : null;
                } else {
                    return hl.parentNode != null ? hl : null;
                }
            });

            return normalizedHighlights;
        },

        flattenNestedHighlights: function(highlights) {
            var self = this;

            function shouldFlatten(current, node) {
                return node && node.nodeType == nodeTypes.ELEMENT_NODE
                    && $(current).css('background-color') == $(node).css('background-color')
                    && $(node).hasClass(self.options.highlightedClass)
                    ? true : false;
            }

            $.each(highlights, function(i) {
                var highlight = this,
                    parent = highlight.parentNode;

                if (self.isHighlight(parent)) {
                    if ($(parent).css('background-color') == $(highlight).css('background-color')) {
                        var childNodes = highlight.childNodes;
                        for (var i = 0; i < childNodes.length; i++) {
                            var node = childNodes[i].cloneNode(true);
                            parent.insertBefore(node, highlight);
                        }
                        parent.removeChild(highlight);
                    } else {
                        var clone = parent.cloneNode(false),
                            container = parent.parentNode,
                            node = parent.firstChild;

                        // split the parent node into two elements
                        container.insertBefore(clone, parent);

                        while (! self.isHighlight(node)) {
                            var next = node.nextSibling;
                            clone.appendChild(node);
                            node = next;
                        }

                        // trim remaining whitespace from the first element
                        var last = clone.lastChild;
                        if (last && last.nodeType == nodeTypes.TEXT_NODE && last.textContent == " ") {
                            container.insertBefore(last, parent);
                        }

                        // bring the highlight element inline with the parent
                        container.insertBefore(highlight, parent);

                        // trim remaining whitespace from the second element
                        var first = parent.firstChild;
                        if (first && first.nodeType == nodeTypes.TEXT_NODE && first.textContent == " ") {
                            container.insertBefore(first, parent);
                        }

                        if (! clone.hasChildNodes()) {
                            container.removeChild(clone);
                        }

                        if (! parent.hasChildNodes()) {
                            container.removeChild(parent);
                        }
                    }
                }
            });
        },

        mergeSiblingHighlights: function(highlights) {
            var self = this;

            function shouldMerge(current, node) {
                return node && node.nodeType == nodeTypes.ELEMENT_NODE
                    && $(current).css('background-color') == $(node).css('background-color')
                    && $(node).hasClass(self.options.highlightedClass)
                    ? true : false;
            }

            $.each(highlights, function() {
                var highlight = this;

                var prev = highlight.previousSibling;
                while (prev && prev.nodeType != nodeTypes.ELEMENT_NODE) {
                    prev = prev.previousSibling;
                }

                if (shouldMerge(highlight, prev)) {
                    var first = highlight.firstChild;

                    while (prev !== highlight) {
                        var next = prev.nextSibling;

                        if (prev.nodeType == nodeTypes.TEXT_NODE) {
                            var node = prev.cloneNode(true);
                            highlight.insertBefore(node, first);
                        } else {
                            var childNodes = prev.childNodes;
                            for (var i = 0; i < childNodes.length; i++) {
                                var node = childNodes[i].cloneNode(true);
                                highlight.insertBefore(node, first);
                            }
                        }
                        prev.parentNode.removeChild(prev);
                        prev = next;
                    }
                }
            });

            $.each(highlights, function() {
                var highlight = this;

                var next = highlight.nextSibling;
                while (next && next.nodeType != nodeTypes.ELEMENT_NODE) {
                    next = next.nextSibling;
                }

                if (shouldMerge(highlight, next)) {
                    var last = highlight.lastChild.nextSibling;

                    while (next != highlight) {
                        var prev = next.previousSibling;

                        if (next.nodeType == nodeTypes.TEXT_NODE) {
                            var node = next.cloneNode(true);
                            last = highlight.insertBefore(node, last);
                        } else {
                            var childNodes = next.childNodes;
                            for (var i = childNodes.length - 1; i > -1; i--) {
                                var node = childNodes[i].cloneNode(true);
                                last = highlight.insertBefore(node, last);
                            }
                        }
                        next.parentNode.removeChild(next);
                        next = prev;
                    }
                }
            });
        },

        setColor: function(color) {
            this.options.color = color;
        },

        getColor: function() {
            return this.options.color;
        },

        /**
         * Removes all highlights in given element or in context if no element given.
         */
        removeHighlights: function(element) {
            var self = this,
                container = (element !== undefined ? element : this.context),
                $highlights = this.getAllHighlights(container, true);
            
            $highlights.each(function() {
                var highlight = this;
                if (self.options.onRemoveHighlight(highlight) == true) {
                    $(highlight).contents().unwrap();
                }
            });
        },

        /**
         * Returns all highlights in given container. If container is a highlight itself and
         * andSelf is true, container will be also returned
         */
        getAllHighlights: function(container, andSelf) {
            var classSelectorStr = '.' + this.options.highlightedClass;
            var $highlights = $(container).find(classSelectorStr);
            if (andSelf == true && $(container).hasClass(this.options.highlightedClass)) {
                $highlights = $highlights.add(container);
            }
            return $highlights;
        },

        /**
         * Returns true if element is highlight, ie. has proper class.
         */
        isHighlight: function(el) {
            return $(el).hasClass(this.options.highlightedClass);
        },

        /**
         * Return the contents of the highlight region minus touch wrappers
         */
        unwrapTextNodes: function() {
            var clone = this.$context.clone();
            clone.unwrapTextNodes(this.options.touchClass);
            return clone.html();
        },

        /**
         *
         */
        enable: function() {
            this.options.disabled = false;
        },

        disable: function() {
            this.options.disabled = true;
        }

    };

    $.fn.getHighlighter = function() {
        return this.data(plugin.name);
    };

    $.fn[plugin.name] = function(options) {
        return this.each(function() {
            if (!$.data(this, plugin.name)) {
                $.data(this, plugin.name, new TouchHighlighter(this, options));
            }
        });
    };

    $.touchHighlighter = {
        /**
         * Returns HTML element to wrap selected text in.
         */
        createWrapper: function(options) {
            return $('<span></span>')
                .css('backgroundColor', options.color)
                .addClass(options.highlightedClass);
        },
        defaults: {
            color: '#ffff7b',
            highlightedClass: 'highlighted',
            contextClass: 'highlighter-context',
            touchClass: 'touch',
            disabled: false,
            mergeHighlights: true,
            preventDefault: true,
            allowVerticalScroll: false,
            onRemoveHighlight: function() { return true; },
            onBeforeHighlight: function() { return true; },
            onAfterHighlight: function() { }
        }
    };

})(jQuery, window, document);