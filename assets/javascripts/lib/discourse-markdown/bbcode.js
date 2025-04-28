import { i18n } from "discourse-i18n";

function wrap(tag, attr, callback) {
  return function (startToken, finishToken, tagInfo) {
    startToken.tag = finishToken.tag = tag;
    startToken.content = finishToken.content = "";

    startToken.type = "bbcode_open";
    finishToken.type = "bbcode_close";

    startToken.nesting = 1;
    finishToken.nesting = -1;

    startToken.attrs = [
      [attr, callback ? callback(tagInfo) : tagInfo.attrs._default],
    ];
  };
}

function setupMarkdownIt(md) {
  const ruler = md.inline.bbcode.ruler;

  ruler.push("size", {
    tag: "size",

    wrap: wrap(
      "span",
      "style",
      (tagInfo) => "font-size:" + tagInfo.attrs._default.trim() + "%"
    ),
  });

  ruler.push("font", {
    tag: "font",

    wrap: wrap(
      "span",
      "style",
      (tagInfo) => `font-family:'${tagInfo.attrs._default.trim()}'`
    ),
  });

  ruler.push("color", {
    tag: "color",

    wrap: wrap(
      "span",
      "style",
      (tagInfo) => "color:" + tagInfo.attrs._default.trim()
    ),
  });

  ruler.push("bgcolor", {
    tag: "bgcolor",

    wrap: wrap(
      "span",
      "style",
      (tagInfo) => "background-color:" + tagInfo.attrs._default.trim()
    ),
  });

  ruler.push("highlight", {
    tag: "highlight",
    wrap: "span.highlight",
  });

  ruler.push("small", {
    tag: "small",
    wrap: wrap("span", "style", () => "font-size:x-small"),
  });

  ruler.push("aname", {
    tag: "aname",
    wrap: wrap("a", "name"),
  });

  ruler.push("jumpto", {
    tag: "jumpto",
    wrap: wrap("a", "href", (tagInfo) => "#" + tagInfo.attrs._default),
  });

  ["left", "right", "center"].forEach((dir) => {
    md.block.bbcode.ruler.push(dir, {
      tag: dir,
      wrap: function (token) {
        token.attrs = [["style", "text-align:" + dir]];
        return true;
      },
    });
  });

  md.block.bbcode.ruler.push("indent", {
    tag: "indent",
    wrap: "blockquote.indent",
  });


  // **** ADD THE NEW [hr] RULE HERE ****
  md.block.bbcode.ruler.push("hr", {
    tag: "hr",
    replace: function (state, tagInfo /*, content */) {
      let token = state.push('hr', 'hr', 0);
      token.markup = '[hr]'; // Basic markup ref
      token.map = [tagInfo.startLine, tagInfo.endLine];

      // *** NEW: Check for and add the style attribute ***
      // Assumes the BBCode parser puts the value of style="..." into tagInfo.attrs.style
      if (tagInfo.attrs && tagInfo.attrs.style) {
        // The actual sanitization happens via the helper.allowList 'custom' function later
        token.attrs = [['style', tagInfo.attrs.style]];
        // Potentially update markup reference if needed
        // token.markup = `[hr style="${tagInfo.attrs.style}"]`;
      }
      // *** END NEW ***

      return true;
    }
  });
  // **** END OF NEW RULE ****

  ["ot", "edit"].forEach((tag) => {
    md.block.bbcode.ruler.push("ot", {
      tag,
      before: function (state) {
        let token = state.push("sepquote_open", "div", 1);
        token.attrs = [["class", "sepquote"]];

        token = state.push("span_open", "span", 1);
        token.block = false;
        token.attrs = [["class", "smallfont"]];

        token = state.push("text", "", 0);
        token.content = i18n("bbcode." + tag);

        token = state.push("span_close", "span", -1);

        state.push("soft_break", "br", 0);
        state.push("soft_break", "br", 0);
      },
      after: function (state) {
        state.push("sepquote_close", "div", -1);
      },
    });
  });

  ["list", "ul", "ol"].forEach((tag) => {
    md.block.bbcode.ruler.push(tag, {
      tag,
      replace: function (state, tagInfo, content) {
        let ol = tag === "ol" || (tag === "list" && tagInfo.attrs._default);
        let token;

        if (ol) {
          token = state.push("ordered_list_open", "ol", 1);
          if (tagInfo.attrs._default) {
            token.attrs = [["type", tagInfo.attrs._default]];
          }
        } else {
          state.push("bullet_list_open", "ul", 1);
        }

        let lines = content.split("\n");
        let list = [null];
        let index = 0;

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];

          let match = line.match(/^\s*\[?\*\]?(.*)/);
          if (match) {
            index++;
            list[index] = match[1];
            continue;
          }

          match = line.match(/\s*\[li\](.*)\[\/li\]\s*$/);
          if (match) {
            index++;
            list[index] = match[1];
            continue;
          }

          if (list[index]) {
            list[index] += "\n" + line;
          } else {
            list[index] = line;
          }
        }

        list.forEach((li) => {
          if (li !== null) {
            state.push("list_item_open", "li", 1);
            // a bit lazy, we could use a block parser here
            // but it means a lot of fussing with line marks
            token = state.push("inline", "", 0);
            token.content = li;
            token.children = [];

            state.push("list_item_close", "li", -1);
          }
        });

        if (ol) {
          state.push("ordered_list_close", "ol", -1);
        } else {
          state.push("bullet_list_close", "ul", -1);
        }

        return true;
      },
    });
  });
}

export function setup(helper) {
  helper.allowList([
    "div.highlight",
    "span.highlight",
    "div.sepquote",
    "span.smallfont",
    "blockquote.indent",
    "ol[type=*]",
    // Allow hr tag itself (already added)
    "hr",
    // *** IMPORTANT: Allow hr tag WITH a style attribute ***
    "hr[style]"
  ]);

  helper.allowList({
    custom(tag, name, value) {
      if (tag === "span" && name === "style") {
        return /^(font-size:(xx-small|x-small|small|medium|large|x-large|xx-large|[0-9]{1,3}%)|background-color:#?[a-zA-Z0-9]+|color:#?[a-zA-Z0-9]+|font-family:'[a-zA-Z0-9\s-]+')$/.exec(
          value
        );
      }

      if (tag === "div" && name === "style") {
        return /^text-align:(center|left|right)$/.exec(value);
      }

      // --- *** NEW: Allow specific styles for HR *** ---
      if (tag === 'hr' && name === 'style') {
        // 1. Define allowed CSS properties and regex for their valid values
        const allowedProperties = {
          // Color values: hex (#rgb, #rrggbb, #rrggbbaa), rgb(), rgba(), named colors
          'color': /^(#[a-fA-F0-9]{3,8}|rgba?\([\d\s,.]+\)|[a-zA-Z]+)$/i,
          'background-color': /^(#[a-fA-F0-9]{3,8}|rgba?\([\d\s,.]+\)|[a-zA-Z]+)$/i,
          // Length/percentage values: px, %, em, rem (add other units if needed)
          'height': /^\d+(\.\d+)?(px|%|em|rem)$/,
          'width': /^\d+(\.\d+)?(px|%|em|rem)$/,
          // Margin values: 1-4 length/percentage values or 'auto'
          'margin': /^(-?\d+(\.\d+)?(px|%|em|rem|auto)\s*){1,4}$/,
          'margin-top': /^-?\d+(\.\d+)?(px|%|em|rem|auto)$/,
          'margin-bottom': /^-?\d+(\.\d+)?(px|%|em|rem|auto)$/,
          // Border values: 'none' is safest. Allowing full border spec is complex.
          // Let's allow 'none' and specific border-top for simplicity
          'border': /^none$/,
          'border-top': /^\d+(\.\d+)?(px|em|rem)\s+(none|solid|dashed|dotted)\s+(#[a-fA-F0-9]{3,8}|rgba?\([\d\s,.]+\)|[a-zA-Z]+)$/i,
          // Opacity: number between 0 and 1
          'opacity': /^(0(\.\d+)?|1(\.0+)?)$/
        };

        // 2. Parse the incoming style string 'value'
        const declarations = value
          .split(';') // Split into individual declarations
          .map(s => s.trim()) // Trim whitespace
          .filter(s => s.length > 0); // Remove empty parts

        // Optional: Check if the original value was just whitespace or empty but not truly empty string
        if (declarations.length === 0 && value.trim() !== '') {
          console.warn("Invalid HR style format:", value);
          return false; // Disallow if format is bad (e.g., just ';')
        }
        if (declarations.length === 0 && value.trim() === '') {
          return true; // Allow empty style="" attribute
        }


        // 3. Validate EACH declaration
        for (const decl of declarations) {
          const parts = decl.split(':');
          if (parts.length !== 2) {
            console.warn("Invalid HR style declaration:", decl);
            return false; // Invalid format (must be property:value)
          }

          const prop = parts[0].trim().toLowerCase(); // Normalize property name
          const val = parts[1].trim(); // Get value

          if (!allowedProperties[prop]) {
            console.warn(`Disallowed HR style property: ${prop}`);
            return false; // Property itself is not allowed
          }

          if (!allowedProperties[prop].test(val)) {
            console.warn(`Invalid value for HR style property ${prop}:`, val);
            return false; // Value format is not allowed for this property
          }
        }

        // 4. If all declarations passed validation
        return true;
      }
      // --- *** END of HR Style Validation *** ---
    },
  });

  helper.registerOptions((opts) => {
    opts.features["bbcode"] = true;
  });

  helper.registerPlugin(setupMarkdownIt);
}
