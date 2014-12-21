angular.module('ngPatternRestrict', [])
  .value('ngPatternRestrictConfig', {
    showDebugInfo: true,
  })
  .directive('ngPatternRestrict', ['ngPatternRestrictConfig', function(patternRestrictConfig) {
    function showDebugInfo(message) {
      if (patternRestrictConfig.showDebugInfo) {
        console.log("[ngPatternRestrict] " + message);
      }
    };

    return {
      restrict: 'A',
      require: "?ngModel",
      compile: function uiPatternRestrictCompile() {
        var options = patternRestrictConfig;
        showDebugInfo("Loaded");

        return function ngPatternRestrictLinking(scope, iElement, iAttrs, ngModelController) {
          var originalPattern;
          var eventsBound = false; // have we bound our events yet?
          var regex; // validation regex object
          var oldValue; // keeping track of the previous value of the element
          var initialized = false; // have we initialized our directive yet?
          var caretPosition; // keeping track of where the caret is at to avoid jumpiness

          //-------------------------------------------------------------------
          // initialization
          function initialize() {
            if (initialized) return;
            showDebugInfo("Initializing");

            readPattern();

            oldValue = iElement.val();
            if (!oldValue) oldValue = "";
            showDebugInfo("Original value: " + oldValue);

            bindListeners();

            initialized = true;
          };

          function readPattern() {
            originalPattern = iAttrs.pattern;
            showDebugInfo("Original pattern: " + originalPattern);

            //TEST should default to ngPatternRestrict, but if not present should check for pattern
            var entryRegex = !!iAttrs.ngPatternRestrict ? iAttrs.ngPatternRestrict : originalPattern;
            showDebugInfo("RegEx to use: " + entryRegex);
            tryParseRegex(entryRegex);
          };

          function uninitialize() {
            showDebugInfo("Uninitializing");
            unbindListeners();
          };

          //-------------------------------------------------------------------
          // setup events
          function bindListeners() {
            if (eventsBound) return;

            iElement.bind('input keyup click', genericEventHandler);
            showDebugInfo("Bound events: input, keyup, click");
          };

          function unbindListeners() {
            if (!eventsBound) return;

            iElement.unbind('input', genericEventHandler);
            //input: HTML5 spec, changes in content

            iElement.unbind('keyup', genericEventHandler);
            //keyup: DOM L3 spec, key released (possibly changing content)

            iElement.unbind('click', genericEventHandler);
            //click: DOM L3 spec, mouse clicked and released (possibly changing content)

            showDebugInfo("Unbound events: input, keyup, click");

            eventsBound = false;
          };

          //-------------------------------------------------------------------
          // setup based on attributes
          function tryParseRegex(regexString) {
            try {
              regex = new RegExp(regexString);
            } catch (e) {
              throw "Invalid RegEx string parsed for ngPatternRestrict: " + regexString;
            }
          };

          //-------------------------------------------------------------------
          // event handlers
          function genericEventHandler(evt) {
            showDebugInfo("Reacting to event: " + evt.type);
            var newValue = iElement.val();

            //HACK Chrome returns an empty string as value if user inputs a non-numeric string into a number type input
            // with this happening, we cannot rely on the value to validate the regex, we need to assume this to be wrong
            var inputValidity = iElement.prop("validity");
            if (newValue === "" && iElement.attr("type") === "number" && inputValidity && inputValidity.badInput) {
              showDebugInfo("Value cannot be verified. Should be invalid. Reverting back to: '" + oldValue + "'");
              evt.preventDefault();
              revertToPreviousValue();
            } else if (regex.test(newValue)) {
              showDebugInfo("New value passed validation against " + regex + ": '" + newValue + "'");
              updateCurrentValue(newValue);
            } else {
              showDebugInfo("New value did NOT pass validation against " + regex + ": '" + newValue + "', reverting back to: '" + oldValue + "'");
              evt.preventDefault();
              revertToPreviousValue();
            }
          };

          function revertToPreviousValue() {
            if (ngModelController) {
              scope.$apply(function() {
                ngModelController.$setViewValue(oldValue);
              });
            }
            iElement.val(oldValue);

            if (!angular.isUndefined(caretPosition))
              setCaretPosition(caretPosition);
          };

          function updateCurrentValue(newValue) {
            oldValue = newValue;
            caretPosition = getCaretPosition();
          };

          //-------------------------------------------------------------------
          // caret position

          // logic from http://stackoverflow.com/a/9370239/147507
          function getCaretPosition() {
            var input = iElement[0]; // we need to go under jqlite

            // IE support
            if (document.selection) {
              var range = document.selection.createRange();
              range.moveStart('character', -iElement.val().length);
              return range.text.length;
            } else {
              try {
                return input.selectionStart;
              } catch (e) {
                // Chrome won't allow us to get a selectionStart for input type=number
                if (e.code !== 11 && e.message !== "InvalidStateError") throw e;

                // based on http://stackoverflow.com/a/24247942/147507
                var s = window.getSelection();
                var originalSelectionLength = String(s).length;

                var selectionLength, didReachZero = false;
                do {
                  selectionLength = String(s).length;
                  s.modify('extend', 'backward', 'character');
                  // we're undoing a selection, and starting a new one to the start of the string
                  if (String(s).length === 0) didReachZero = true;
                } while (selectionLength !== String(s).length);

                var detectedCaretPosition = didReachZero ?
                  selectionLength :
                  selectionLength - originalSelectionLength;
                s.collapseToStart();

                var restorePositionCounter = detectedCaretPosition;
                while (restorePositionCounter-- > 0) {
                  s.modify('move', 'forward', 'character');
                }
                while (originalSelectionLength-- > 0) {
                  s.modify('extend', 'forward', 'character');
                }

                return detectedCaretPosition;
              }
            }
          }

          // logic from http://stackoverflow.com/q/5755826/147507
          function setCaretPosition(position) {
            var input = iElement[0]; // we need to go under jqlite
            if (input.createTextRange) {
              var textRange = input.createTextRange();
              textRange.collapse(true);
              textRange.moveEnd('character', position);
              textRange.moveStart('character', position);
              textRange.select();
            } else {
              try {
                input.setSelectionRange(position, position);
              } catch (e) {
                // Chrome won't allow us to get a selectionStart for input type=number
                if (e.code !== 11 && e.message !== "InvalidStateError") throw e;

                var s = window.getSelection();
                var selectionLength;
                do {
                  selectionLength = String(s).length;
                  s.modify('extend', 'backward', 'line');
                } while (selectionLength !== String(s).length);
                s.collapseToStart();

                var counterToPosition = caretPosition;
                while (counterToPosition--) {
                  s.modify('move', 'forward', 'character');
                }
              }
            }
          }

          iAttrs.$observe("ngPatternRestrict", readPattern);
          iAttrs.$observe("pattern", readPattern);

          scope.$on("$destroy", uninitialize);

          initialize();
        };
      }
    };
  }]);
