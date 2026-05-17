(function () {
    "use strict";

    function isDigit(character) {
        return character >= "0" && character <= "9";
    }

    function isIdentifierStart(character) {
        return (character >= "a" && character <= "z")
                || (character >= "A" && character <= "Z")
                || character === "_";
    }

    function isIdentifierPart(character) {
        return isIdentifierStart(character) || isDigit(character);
    }

    function finite(value) {
        return Number.isFinite(value) && !Number.isNaN(value) ? value : 0;
    }

    function truthy(value) {
        return Math.abs(value) > 0.00001;
    }

    function positiveModulo(left, right) {
        if (Math.abs(right) < 0.00001) {
            return 0;
        }
        return ((left % right) + right) % right;
    }

    var OP_CONST = 1;
    var OP_GET = 2;
    var OP_SET = 3;
    var OP_POP = 4;
    var OP_NEG = 5;
    var OP_ADD = 6;
    var OP_SUB = 7;
    var OP_MUL = 8;
    var OP_DIV = 9;
    var OP_MOD = 10;
    var OP_CALL = 11;
    var OP_JUMP = 12;
    var OP_JUMP_IF_FALSE = 13;
    var OP_SIN = 14;
    var OP_COS = 15;
    var OP_ACOS = 16;
    var OP_ATAN2 = 17;
    var OP_SQRT = 18;
    var OP_SQR = 19;
    var OP_ABS = 20;
    var OP_MIN2 = 21;
    var OP_MAX2 = 22;
    var OP_SIGN = 23;
    var OP_ABOVE = 24;
    var OP_BELOW = 25;
    var OP_BAND = 26;
    var OP_BOR = 27;
    var OP_EQUAL = 28;
    var OP_GETOSC1 = 29;
    var OP_NOT = 30;
    var OP_BITOR = 31;
    var OP_BITAND = 32;
    var OP_GETSPEC1 = 33;

    var FN_IF = 1;
    var FN_SIN = 2;
    var FN_COS = 3;
    var FN_ACOS = 4;
    var FN_ATAN2 = 5;
    var FN_SQRT = 6;
    var FN_SQR = 7;
    var FN_ABS = 8;
    var FN_MIN = 9;
    var FN_MAX = 10;
    var FN_SIGN = 11;
    var FN_ABOVE = 12;
    var FN_BELOW = 13;
    var FN_BAND = 14;
    var FN_BOR = 15;
    var FN_EQUAL = 16;
    var FN_GETOSC = 17;
    var FN_TAN = 18;
    var FN_ASIN = 19;
    var FN_ATAN = 20;
    var FN_POW = 21;
    var FN_EXP = 22;
    var FN_LOG = 23;
    var FN_LOG10 = 24;
    var FN_FLOOR = 25;
    var FN_CEIL = 26;
    var FN_INT = 27;
    var FN_RAND = 28;
    var FN_BNOT = 29;
    var FN_SIGMOID = 30;
    var FN_BITOR = 31;
    var FN_BITAND = 32;
    var FN_INVSQRT = 33;
    var FN_GETSPEC = 34;

    function tokenize(source) {
        var tokens = [];
        var index = 0;
        while (index < source.length) {
            var character = source[index];
            if (character === " " || character === "\t" || character === "\f") {
                index++;
                continue;
            }
            if (character === "\r" || character === "\n" || character === ";") {
                tokens.push({ type: "semi", value: ";" });
                if (character === "\r" && source[index + 1] === "\n") {
                    index += 2;
                } else {
                    index++;
                }
                continue;
            }
            if (character === "/" && source[index + 1] === "/") {
                index += 2;
                while (index < source.length && source[index] !== "\n" && source[index] !== "\r") {
                    index++;
                }
                continue;
            }
            if (character === "/" && source[index + 1] === "*") {
                index += 2;
                while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
                    index++;
                }
                index = Math.min(source.length, index + 2);
                continue;
            }
            if (character === "0" && (source[index + 1] === "x" || source[index + 1] === "X")) {
                var hexStart = index;
                index += 2;
                while ((source[index] >= "0" && source[index] <= "9")
                        || (source[index] >= "a" && source[index] <= "f")
                        || (source[index] >= "A" && source[index] <= "F")) {
                    index++;
                }
                if (index === hexStart + 2) {
                    throw new Error("Invalid EEL hex literal");
                }
                tokens.push({
                    type: "number",
                    value: Number(source.slice(hexStart, index))
                });
                continue;
            }
            if (isDigit(character) || (character === "." && isDigit(source[index + 1]))) {
                var numberStart = index;
                if (character === ".") {
                    index++;
                }
                while (isDigit(source[index])) {
                    index++;
                }
                if (source[index] === ".") {
                    index++;
                    while (isDigit(source[index])) {
                        index++;
                    }
                }
                if (source[index] === "e" || source[index] === "E") {
                    var exponentStart = index;
                    index++;
                    if (source[index] === "+" || source[index] === "-") {
                        index++;
                    }
                    if (!isDigit(source[index])) {
                        index = exponentStart;
                    } else {
                        while (isDigit(source[index])) {
                            index++;
                        }
                    }
                }
                tokens.push({
                    type: "number",
                    value: Number(source.slice(numberStart, index))
                });
                continue;
            }
            if (isIdentifierStart(character)) {
                var identifierStart = index;
                index++;
                while (isIdentifierPart(source[index])) {
                    index++;
                }
                tokens.push({
                    type: "identifier",
                    value: source.slice(identifierStart, index).toLowerCase()
                });
                continue;
            }
            var pair = source.slice(index, index + 2);
            if (pair === "==" || pair === "!=" || pair === "<=" || pair === ">="
                    || pair === "&&" || pair === "||" || pair === "+=" || pair === "-="
                    || pair === "*=" || pair === "/=" || pair === "%=") {
                tokens.push({ type: "operator", value: pair });
                index += 2;
                continue;
            }
            if ("+-*/%=(),<>!&|".indexOf(character) >= 0) {
                tokens.push({ type: "operator", value: character });
                index++;
                continue;
            }
            throw new Error("Unsupported EEL character: " + character);
        }
        tokens.push({ type: "eof", value: "" });
        return tokens;
    }

    function Parser(tokens) {
        this.tokens = tokens;
        this.index = 0;
    }

    Parser.prototype.peek = function (offset) {
        return this.tokens[this.index + (offset || 0)] || this.tokens[this.tokens.length - 1];
    };

    Parser.prototype.consume = function () {
        return this.tokens[this.index++];
    };

    Parser.prototype.match = function (value) {
        if (this.peek().value === value) {
            this.index++;
            return true;
        }
        return false;
    };

    Parser.prototype.expect = function (value) {
        if (!this.match(value)) {
            throw new Error("Expected '" + value + "' in EEL expression");
        }
    };

    Parser.prototype.skipSemicolons = function () {
        while (this.peek().type === "semi") {
            this.index++;
        }
    };

    Parser.prototype.parseProgram = function () {
        var body = [];
        this.skipSemicolons();
        while (this.peek().type !== "eof") {
            body.push(this.parseStatement());
            this.skipSemicolons();
        }
        return body;
    };

    Parser.prototype.parseStatement = function () {
        if (this.peek().type === "identifier" && isAssignmentOperator(this.peek(1).value)) {
            var name = this.consume().value;
            var operator = this.consume().value;
            return {
                type: "assignment",
                name: name,
                operator: operator,
                expression: this.parseExpression(0)
            };
        }
        return {
            type: "expression",
            expression: this.parseExpression(0)
        };
    };

    Parser.prototype.parseExpression = function (minPrecedence) {
        var left = this.parseUnary();
        while (true) {
            var token = this.peek();
            var precedence = binaryPrecedence(token.value);
            if (precedence < minPrecedence) {
                break;
            }
            var operator = this.consume().value;
            var right = this.parseExpression(precedence + 1);
            left = {
                type: "binary",
                operator: operator,
                left: left,
                right: right
            };
        }
        return left;
    };

    Parser.prototype.parseUnary = function () {
        if (this.match("+")) {
            return this.parseUnary();
        }
        if (this.match("-")) {
            return {
                type: "unary",
                operator: "-",
                expression: this.parseUnary()
            };
        }
        if (this.match("!")) {
            return {
                type: "unary",
                operator: "!",
                expression: this.parseUnary()
            };
        }
        return this.parsePrimary();
    };

    Parser.prototype.parsePrimary = function () {
        var token = this.consume();
        if (token.type === "number") {
            return { type: "number", value: finite(token.value) };
        }
        if (token.type === "identifier") {
            if (this.match("(")) {
                var args = [];
                if (!this.match(")")) {
                    do {
                        args.push(this.parseExpression(0));
                    } while (this.match(","));
                    this.expect(")");
                }
                return {
                    type: "call",
                    name: token.value,
                    args: args
                };
            }
            return { type: "variable", name: token.value };
        }
        if (token.value === "(") {
            var expression = this.parseExpression(0);
            this.expect(")");
            return expression;
        }
        throw new Error("Unexpected EEL token: " + token.value);
    };

    function binaryPrecedence(operator) {
        if (operator === "||") {
            return 1;
        }
        if (operator === "&&") {
            return 2;
        }
        if (operator === "|" || operator === "&") {
            return 3;
        }
        if (operator === "==" || operator === "!=") {
            return 4;
        }
        if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") {
            return 5;
        }
        if (operator === "*" || operator === "/" || operator === "%") {
            return 20;
        }
        if (operator === "+" || operator === "-") {
            return 10;
        }
        return -1;
    }

    function isAssignmentOperator(operator) {
        return operator === "=" || operator === "+=" || operator === "-=" || operator === "*="
                || operator === "/=" || operator === "%=";
    }

    function assignmentBinaryOperator(operator) {
        if (operator === "+=") {
            return "+";
        }
        if (operator === "-=") {
            return "-";
        }
        if (operator === "*=") {
            return "*";
        }
        if (operator === "/=") {
            return "/";
        }
        if (operator === "%=") {
            return "%";
        }
        return "";
    }

    function compileBinaryOperator(operator, ops) {
        if (operator === "+") {
            ops.push(OP_ADD);
        } else if (operator === "-") {
            ops.push(OP_SUB);
        } else if (operator === "*") {
            ops.push(OP_MUL);
        } else if (operator === "/") {
            ops.push(OP_DIV);
        } else if (operator === "%") {
            ops.push(OP_MOD);
        } else if (operator === ">") {
            ops.push(OP_ABOVE);
        } else if (operator === "<") {
            ops.push(OP_BELOW);
        } else if (operator === ">=") {
            ops.push(OP_BELOW, OP_NOT);
        } else if (operator === "<=") {
            ops.push(OP_ABOVE, OP_NOT);
        } else if (operator === "==") {
            ops.push(OP_EQUAL);
        } else if (operator === "!=") {
            ops.push(OP_EQUAL, OP_NOT);
        } else if (operator === "&&") {
            ops.push(OP_BAND);
        } else if (operator === "||") {
            ops.push(OP_BOR);
        } else if (operator === "&") {
            ops.push(OP_BITAND);
        } else if (operator === "|") {
            ops.push(OP_BITOR);
        }
    }

    function readVariable(scope, name) {
        if (Object.prototype.hasOwnProperty.call(scope, name)) {
            return finite(Number(scope[name]));
        }
        if (name === "pi") {
            return Math.PI;
        }
        return 0;
    }

    function compileExpression(node, ops) {
        if (node.type === "number") {
            ops.push(OP_CONST, node.value);
            return;
        }
        if (node.type === "variable") {
            ops.push(OP_GET, node.name);
            return;
        }
        if (node.type === "unary") {
            compileExpression(node.expression, ops);
            ops.push(node.operator === "!" ? OP_NOT : OP_NEG);
            return;
        }
        if (node.type === "binary") {
            compileExpression(node.left, ops);
            compileExpression(node.right, ops);
            compileBinaryOperator(node.operator, ops);
            return;
        }
        if (node.type === "call") {
            if (node.name === "if") {
                compileExpression(node.args[0], ops);
                ops.push(OP_JUMP_IF_FALSE, 0);
                var falseJump = ops.length - 1;
                compileExpression(node.args[1] || { type: "number", value: 0 }, ops);
                ops.push(OP_JUMP, 0);
                var endJump = ops.length - 1;
                ops[falseJump] = ops.length;
                compileExpression(node.args[2] || { type: "number", value: 0 }, ops);
                ops[endJump] = ops.length;
                return;
            }
            for (var index = 0; index < node.args.length; index++) {
                compileExpression(node.args[index], ops);
            }
            ops.push(OP_CALL, node.name, node.args.length);
        }
    }

    function compileStatement(statement, ops) {
        if (statement.type === "assignment") {
            var operator = assignmentBinaryOperator(statement.operator);
            if (operator) {
                ops.push(OP_GET, statement.name);
            }
            compileExpression(statement.expression, ops);
            if (operator) {
                compileBinaryOperator(operator, ops);
            }
            ops.push(OP_SET, statement.name);
            return;
        }
        compileExpression(statement.expression, ops);
        ops.push(OP_POP);
    }

    function callBuiltin(name, stack, start, count, host) {
        var first = count > 0 ? stack[start] : 0;
        var second = count > 1 ? stack[start + 1] : 0;
        if (name === "if") {
            return truthy(first) ? second : (count > 2 ? stack[start + 2] : 0);
        }
        if (name === "sin") {
            return finite(Math.sin(first || 0));
        }
        if (name === "cos") {
            return finite(Math.cos(first || 0));
        }
        if (name === "tan") {
            return finite(Math.tan(first || 0));
        }
        if (name === "asin") {
            return finite(Math.asin(Math.max(-1, Math.min(1, first || 0))));
        }
        if (name === "acos") {
            return finite(Math.acos(Math.max(-1, Math.min(1, first || 0))));
        }
        if (name === "atan") {
            return finite(Math.atan(first || 0));
        }
        if (name === "atan2") {
            return finite(Math.atan2(first || 0, second || 0));
        }
        if (name === "sqrt") {
            return finite(Math.sqrt(Math.max(0, first || 0)));
        }
        if (name === "invsqrt") {
            return Math.abs(first) < 0.00001 ? 0 : finite(1 / Math.sqrt(Math.max(0, first || 0)));
        }
        if (name === "sqr") {
            return finite((first || 0) * (first || 0));
        }
        if (name === "pow") {
            return finite(Math.pow(first || 0, second || 0));
        }
        if (name === "exp") {
            return finite(Math.exp(first || 0));
        }
        if (name === "log") {
            return finite(Math.log(first || 0));
        }
        if (name === "log10") {
            return finite(Math.log(first || 0) * Math.LOG10E);
        }
        if (name === "abs") {
            return finite(Math.abs(first || 0));
        }
        if (name === "floor") {
            return finite(Math.floor(first || 0));
        }
        if (name === "ceil") {
            return finite(Math.ceil(first || 0));
        }
        if (name === "int") {
            return finite(Math.trunc(first || 0));
        }
        if (name === "rand") {
            var limit = Math.floor(first || 0);
            return limit < 1 ? Math.random() : Math.random() * limit;
        }
        if (name === "min") {
            var minimum = count > 0 ? first : 0;
            for (var minIndex = 1; minIndex < count; minIndex++) {
                minimum = Math.min(minimum, stack[start + minIndex]);
            }
            return finite(minimum);
        }
        if (name === "max") {
            var maximum = count > 0 ? first : 0;
            for (var maxIndex = 1; maxIndex < count; maxIndex++) {
                maximum = Math.max(maximum, stack[start + maxIndex]);
            }
            return finite(maximum);
        }
        if (name === "sign") {
            return first > 0 ? 1 : (first < 0 ? -1 : 0);
        }
        if (name === "above") {
            return first > second ? 1 : 0;
        }
        if (name === "below") {
            return first < second ? 1 : 0;
        }
        if (name === "band") {
            return truthy(first) && truthy(second) ? 1 : 0;
        }
        if (name === "bor") {
            return truthy(first) || truthy(second) ? 1 : 0;
        }
        if (name === "bnot") {
            return truthy(first) ? 0 : 1;
        }
        if (name === "equal") {
            return Math.abs((first || 0) - (second || 0)) < 0.00001 ? 1 : 0;
        }
        if (name === "sigmoid") {
            return finite(1 / (1 + Math.exp(-(first || 0) * (second || 0))));
        }
        if (name === "bitor") {
            return Math.floor(first || 0) | Math.floor(second || 0);
        }
        if (name === "bitand") {
            return Math.floor(first || 0) & Math.floor(second || 0);
        }
        if (name === "getosc") {
            return host && typeof host.getosc === "function"
                    ? finite(host.getosc(first || 0, second || 0, count > 2 ? stack[start + 2] : 0))
                    : 0;
        }
        if (name === "getspec") {
            return readSpec(host, first || 0, second || 0, count > 2 ? stack[start + 2] : 0);
        }
        return 0;
    }

    function runBytecode(ops, stack, scope, host) {
        var sp = 0;
        for (var ip = 0; ip < ops.length;) {
            var op = ops[ip++];
            if (op === OP_CONST) {
                stack[sp++] = ops[ip++];
            } else if (op === OP_GET) {
                stack[sp++] = readVariable(scope, ops[ip++]);
            } else if (op === OP_SET) {
                scope[ops[ip++]] = finite(stack[--sp]);
            } else if (op === OP_POP) {
                sp--;
            } else if (op === OP_NEG) {
                stack[sp - 1] = finite(-stack[sp - 1]);
            } else if (op === OP_NOT) {
                stack[sp - 1] = truthy(stack[sp - 1]) ? 0 : 1;
            } else if (op === OP_ADD) {
                stack[sp - 2] = finite(stack[sp - 2] + stack[sp - 1]);
                sp--;
            } else if (op === OP_SUB) {
                stack[sp - 2] = finite(stack[sp - 2] - stack[sp - 1]);
                sp--;
            } else if (op === OP_MUL) {
                stack[sp - 2] = finite(stack[sp - 2] * stack[sp - 1]);
                sp--;
            } else if (op === OP_DIV) {
                stack[sp - 2] = Math.abs(stack[sp - 1]) < 0.00001 ? 0 : finite(stack[sp - 2] / stack[sp - 1]);
                sp--;
            } else if (op === OP_MOD) {
                stack[sp - 2] = finite(positiveModulo(stack[sp - 2], stack[sp - 1]));
                sp--;
            } else if (op === OP_CALL) {
                var name = ops[ip++];
                var count = ops[ip++];
                var start = sp - count;
                var result = callBuiltin(name, stack, start, count, host);
                sp = start;
                stack[sp++] = result;
            } else if (op === OP_JUMP) {
                ip = ops[ip];
            } else if (op === OP_JUMP_IF_FALSE) {
                var target = ops[ip++];
                if (!truthy(stack[--sp])) {
                    ip = target;
                }
            } else if (op === OP_ABOVE) {
                stack[sp - 2] = stack[sp - 2] > stack[sp - 1] ? 1 : 0;
                sp--;
            } else if (op === OP_BELOW) {
                stack[sp - 2] = stack[sp - 2] < stack[sp - 1] ? 1 : 0;
                sp--;
            } else if (op === OP_BAND) {
                stack[sp - 2] = truthy(stack[sp - 2]) && truthy(stack[sp - 1]) ? 1 : 0;
                sp--;
            } else if (op === OP_BOR) {
                stack[sp - 2] = truthy(stack[sp - 2]) || truthy(stack[sp - 1]) ? 1 : 0;
                sp--;
            } else if (op === OP_EQUAL) {
                stack[sp - 2] = Math.abs((stack[sp - 2] || 0) - (stack[sp - 1] || 0)) < 0.00001 ? 1 : 0;
                sp--;
            } else if (op === OP_BITAND) {
                stack[sp - 2] = Math.floor(stack[sp - 2] || 0) & Math.floor(stack[sp - 1] || 0);
                sp--;
            } else if (op === OP_BITOR) {
                stack[sp - 2] = Math.floor(stack[sp - 2] || 0) | Math.floor(stack[sp - 1] || 0);
                sp--;
            }
        }
        return scope;
    }

    function builtinId(name) {
        if (name === "if") {
            return FN_IF;
        }
        if (name === "sin") {
            return FN_SIN;
        }
        if (name === "cos") {
            return FN_COS;
        }
        if (name === "tan") {
            return FN_TAN;
        }
        if (name === "asin") {
            return FN_ASIN;
        }
        if (name === "acos") {
            return FN_ACOS;
        }
        if (name === "atan") {
            return FN_ATAN;
        }
        if (name === "atan2") {
            return FN_ATAN2;
        }
        if (name === "sqrt") {
            return FN_SQRT;
        }
        if (name === "invsqrt") {
            return FN_INVSQRT;
        }
        if (name === "sqr") {
            return FN_SQR;
        }
        if (name === "pow") {
            return FN_POW;
        }
        if (name === "exp") {
            return FN_EXP;
        }
        if (name === "log") {
            return FN_LOG;
        }
        if (name === "log10") {
            return FN_LOG10;
        }
        if (name === "abs") {
            return FN_ABS;
        }
        if (name === "floor") {
            return FN_FLOOR;
        }
        if (name === "ceil") {
            return FN_CEIL;
        }
        if (name === "int") {
            return FN_INT;
        }
        if (name === "rand") {
            return FN_RAND;
        }
        if (name === "min") {
            return FN_MIN;
        }
        if (name === "max") {
            return FN_MAX;
        }
        if (name === "sign") {
            return FN_SIGN;
        }
        if (name === "above") {
            return FN_ABOVE;
        }
        if (name === "below") {
            return FN_BELOW;
        }
        if (name === "band") {
            return FN_BAND;
        }
        if (name === "bor") {
            return FN_BOR;
        }
        if (name === "bnot") {
            return FN_BNOT;
        }
        if (name === "equal") {
            return FN_EQUAL;
        }
        if (name === "sigmoid") {
            return FN_SIGMOID;
        }
        if (name === "bitor") {
            return FN_BITOR;
        }
        if (name === "bitand") {
            return FN_BITAND;
        }
        if (name === "getosc") {
            return FN_GETOSC;
        }
        if (name === "getspec") {
            return FN_GETSPEC;
        }
        return 0;
    }

    function callBuiltinId(id, stack, start, count, host) {
        var first = count > 0 ? stack[start] : 0;
        var second = count > 1 ? stack[start + 1] : 0;
        if (id === FN_IF) {
            return truthy(first) ? second : (count > 2 ? stack[start + 2] : 0);
        }
        if (id === FN_SIN) {
            return finite(Math.sin(first || 0));
        }
        if (id === FN_COS) {
            return finite(Math.cos(first || 0));
        }
        if (id === FN_TAN) {
            return finite(Math.tan(first || 0));
        }
        if (id === FN_ASIN) {
            return finite(Math.asin(Math.max(-1, Math.min(1, first || 0))));
        }
        if (id === FN_ACOS) {
            return finite(Math.acos(Math.max(-1, Math.min(1, first || 0))));
        }
        if (id === FN_ATAN) {
            return finite(Math.atan(first || 0));
        }
        if (id === FN_ATAN2) {
            return finite(Math.atan2(first || 0, second || 0));
        }
        if (id === FN_SQRT) {
            return finite(Math.sqrt(Math.max(0, first || 0)));
        }
        if (id === FN_INVSQRT) {
            return Math.abs(first) < 0.00001 ? 0 : finite(1 / Math.sqrt(Math.max(0, first || 0)));
        }
        if (id === FN_SQR) {
            return finite((first || 0) * (first || 0));
        }
        if (id === FN_POW) {
            return finite(Math.pow(first || 0, second || 0));
        }
        if (id === FN_EXP) {
            return finite(Math.exp(first || 0));
        }
        if (id === FN_LOG) {
            return finite(Math.log(first || 0));
        }
        if (id === FN_LOG10) {
            return finite(Math.log(first || 0) * Math.LOG10E);
        }
        if (id === FN_ABS) {
            return finite(Math.abs(first || 0));
        }
        if (id === FN_FLOOR) {
            return finite(Math.floor(first || 0));
        }
        if (id === FN_CEIL) {
            return finite(Math.ceil(first || 0));
        }
        if (id === FN_INT) {
            return finite(Math.trunc(first || 0));
        }
        if (id === FN_RAND) {
            var limit = Math.floor(first || 0);
            return limit < 1 ? Math.random() : Math.random() * limit;
        }
        if (id === FN_MIN) {
            var minimum = count > 0 ? first : 0;
            for (var minIndex = 1; minIndex < count; minIndex++) {
                minimum = Math.min(minimum, stack[start + minIndex]);
            }
            return finite(minimum);
        }
        if (id === FN_MAX) {
            var maximum = count > 0 ? first : 0;
            for (var maxIndex = 1; maxIndex < count; maxIndex++) {
                maximum = Math.max(maximum, stack[start + maxIndex]);
            }
            return finite(maximum);
        }
        if (id === FN_SIGN) {
            return first > 0 ? 1 : (first < 0 ? -1 : 0);
        }
        if (id === FN_ABOVE) {
            return first > second ? 1 : 0;
        }
        if (id === FN_BELOW) {
            return first < second ? 1 : 0;
        }
        if (id === FN_BAND) {
            return truthy(first) && truthy(second) ? 1 : 0;
        }
        if (id === FN_BOR) {
            return truthy(first) || truthy(second) ? 1 : 0;
        }
        if (id === FN_BNOT) {
            return truthy(first) ? 0 : 1;
        }
        if (id === FN_EQUAL) {
            return Math.abs((first || 0) - (second || 0)) < 0.00001 ? 1 : 0;
        }
        if (id === FN_SIGMOID) {
            return finite(1 / (1 + Math.exp(-(first || 0) * (second || 0))));
        }
        if (id === FN_BITOR) {
            return Math.floor(first || 0) | Math.floor(second || 0);
        }
        if (id === FN_BITAND) {
            return Math.floor(first || 0) & Math.floor(second || 0);
        }
        if (id === FN_GETOSC) {
            return host && typeof host.getosc === "function"
                    ? finite(host.getosc(first || 0, second || 0, count > 2 ? stack[start + 2] : 0))
                    : 0;
        }
        if (id === FN_GETSPEC) {
            return readSpec(host, first || 0, second || 0, count > 2 ? stack[start + 2] : 0);
        }
        return 0;
    }

    function createVariableIndexer(variableMap, variableNames) {
        return function (name) {
            if (!Object.prototype.hasOwnProperty.call(variableMap, name)) {
                variableMap[name] = variableNames.length;
                variableNames.push(name);
            }
            return variableMap[name];
        };
    }

    function compileExpressionSlots(node, ops, variableIndex) {
        if (node.type === "number") {
            ops.push(OP_CONST, node.value);
            return;
        }
        if (node.type === "variable") {
            ops.push(OP_GET, variableIndex(node.name));
            return;
        }
        if (node.type === "unary") {
            compileExpressionSlots(node.expression, ops, variableIndex);
            ops.push(node.operator === "!" ? OP_NOT : OP_NEG);
            return;
        }
        if (node.type === "binary") {
            compileExpressionSlots(node.left, ops, variableIndex);
            compileExpressionSlots(node.right, ops, variableIndex);
            compileBinaryOperator(node.operator, ops);
            return;
        }
        if (node.type === "call") {
            if (node.name === "if") {
                compileExpressionSlots(node.args[0], ops, variableIndex);
                ops.push(OP_JUMP_IF_FALSE, 0);
                var falseJump = ops.length - 1;
                compileExpressionSlots(node.args[1] || { type: "number", value: 0 }, ops, variableIndex);
                ops.push(OP_JUMP, 0);
                var endJump = ops.length - 1;
                ops[falseJump] = ops.length;
                compileExpressionSlots(node.args[2] || { type: "number", value: 0 }, ops, variableIndex);
                ops[endJump] = ops.length;
                return;
            }
            if (compileDirectCallSlots(node, ops, variableIndex)) {
                return;
            }
            for (var index = 0; index < node.args.length; index++) {
                compileExpressionSlots(node.args[index], ops, variableIndex);
            }
            ops.push(OP_CALL, builtinId(node.name), node.args.length);
        }
    }

    function compileDirectCallSlots(node, ops, variableIndex) {
        if (node.name === "sin" && node.args.length === 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_SIN);
            return true;
        }
        if (node.name === "cos" && node.args.length === 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_COS);
            return true;
        }
        if (node.name === "acos" && node.args.length === 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_ACOS);
            return true;
        }
        if (node.name === "atan2" && node.args.length === 2) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            compileExpressionSlots(node.args[1], ops, variableIndex);
            ops.push(OP_ATAN2);
            return true;
        }
        if (node.name === "sqrt" && node.args.length === 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_SQRT);
            return true;
        }
        if (node.name === "sqr" && node.args.length === 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_SQR);
            return true;
        }
        if (node.name === "abs" && node.args.length === 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_ABS);
            return true;
        }
        if (node.name === "min" && node.args.length === 2) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            compileExpressionSlots(node.args[1], ops, variableIndex);
            ops.push(OP_MIN2);
            return true;
        }
        if (node.name === "max" && node.args.length === 2) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            compileExpressionSlots(node.args[1], ops, variableIndex);
            ops.push(OP_MAX2);
            return true;
        }
        if (node.name === "sign" && node.args.length === 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_SIGN);
            return true;
        }
        if (node.name === "above" && node.args.length === 2) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            compileExpressionSlots(node.args[1], ops, variableIndex);
            ops.push(OP_ABOVE);
            return true;
        }
        if (node.name === "below" && node.args.length === 2) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            compileExpressionSlots(node.args[1], ops, variableIndex);
            ops.push(OP_BELOW);
            return true;
        }
        if (node.name === "band" && node.args.length === 2) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            compileExpressionSlots(node.args[1], ops, variableIndex);
            ops.push(OP_BAND);
            return true;
        }
        if (node.name === "bor" && node.args.length === 2) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            compileExpressionSlots(node.args[1], ops, variableIndex);
            ops.push(OP_BOR);
            return true;
        }
        if (node.name === "equal" && node.args.length === 2) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            compileExpressionSlots(node.args[1], ops, variableIndex);
            ops.push(OP_EQUAL);
            return true;
        }
        if (node.name === "getosc" && node.args.length >= 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_GETOSC1);
            return true;
        }
        if (node.name === "getspec" && node.args.length === 1) {
            compileExpressionSlots(node.args[0], ops, variableIndex);
            ops.push(OP_GETSPEC1);
            return true;
        }
        return false;
    }

    function compileStatementSlots(statement, ops, variableIndex) {
        if (statement.type === "assignment") {
            var operator = assignmentBinaryOperator(statement.operator);
            if (operator) {
                ops.push(OP_GET, variableIndex(statement.name));
            }
            compileExpressionSlots(statement.expression, ops, variableIndex);
            if (operator) {
                compileBinaryOperator(operator, ops);
            }
            ops.push(OP_SET, variableIndex(statement.name));
            return;
        }
        compileExpressionSlots(statement.expression, ops, variableIndex);
        ops.push(OP_POP);
    }

    function runSlotBytecode(ops, stack, values, host) {
        var sp = 0;
        for (var ip = 0; ip < ops.length;) {
            switch (ops[ip++]) {
                case OP_CONST:
                    stack[sp++] = ops[ip++];
                    break;
                case OP_GET:
                    stack[sp++] = values[ops[ip++]];
                    break;
                case OP_SET:
                    values[ops[ip++]] = stack[--sp];
                    break;
                case OP_POP:
                    sp--;
                    break;
                case OP_NEG:
                    stack[sp - 1] = -stack[sp - 1];
                    break;
                case OP_NOT:
                    var notValue = stack[sp - 1];
                    stack[sp - 1] = notValue > 0.00001 || notValue < -0.00001 ? 0 : 1;
                    break;
                case OP_ADD:
                    stack[sp - 2] = stack[sp - 2] + stack[sp - 1];
                    sp--;
                    break;
                case OP_SUB:
                    stack[sp - 2] = stack[sp - 2] - stack[sp - 1];
                    sp--;
                    break;
                case OP_MUL:
                    stack[sp - 2] = stack[sp - 2] * stack[sp - 1];
                    sp--;
                    break;
                case OP_DIV:
                    stack[sp - 2] = Math.abs(stack[sp - 1]) < 0.00001 ? 0 : stack[sp - 2] / stack[sp - 1];
                    sp--;
                    break;
                case OP_MOD:
                    var divisor = stack[sp - 1];
                    stack[sp - 2] = Math.abs(divisor) < 0.00001
                            ? 0
                            : ((stack[sp - 2] % divisor) + divisor) % divisor;
                    sp--;
                    break;
                case OP_CALL:
                    var id = ops[ip++];
                    var count = ops[ip++];
                    var start = sp - count;
                    var result = callBuiltinId(id, stack, start, count, host);
                    sp = start;
                    stack[sp++] = result;
                    break;
                case OP_JUMP:
                    ip = ops[ip];
                    break;
                case OP_JUMP_IF_FALSE:
                    var target = ops[ip++];
                    var condition = stack[--sp];
                    if (!(condition > 0.00001 || condition < -0.00001)) {
                        ip = target;
                    }
                    break;
                case OP_SIN:
                    stack[sp - 1] = Math.sin(stack[sp - 1] || 0);
                    break;
                case OP_COS:
                    stack[sp - 1] = Math.cos(stack[sp - 1] || 0);
                    break;
                case OP_ACOS:
                    stack[sp - 1] = Math.acos(Math.max(-1, Math.min(1, stack[sp - 1] || 0)));
                    break;
                case OP_ATAN2:
                    stack[sp - 2] = Math.atan2(stack[sp - 2] || 0, stack[sp - 1] || 0);
                    sp--;
                    break;
                case OP_SQRT:
                    stack[sp - 1] = Math.sqrt(Math.max(0, stack[sp - 1] || 0));
                    break;
                case OP_SQR:
                    stack[sp - 1] = stack[sp - 1] * stack[sp - 1];
                    break;
                case OP_ABS:
                    stack[sp - 1] = Math.abs(stack[sp - 1] || 0);
                    break;
                case OP_MIN2:
                    stack[sp - 2] = Math.min(stack[sp - 2], stack[sp - 1]);
                    sp--;
                    break;
                case OP_MAX2:
                    stack[sp - 2] = Math.max(stack[sp - 2], stack[sp - 1]);
                    sp--;
                    break;
                case OP_SIGN:
                    stack[sp - 1] = stack[sp - 1] > 0 ? 1 : (stack[sp - 1] < 0 ? -1 : 0);
                    break;
                case OP_ABOVE:
                    stack[sp - 2] = stack[sp - 2] > stack[sp - 1] ? 1 : 0;
                    sp--;
                    break;
                case OP_BELOW:
                    stack[sp - 2] = stack[sp - 2] < stack[sp - 1] ? 1 : 0;
                    sp--;
                    break;
                case OP_BAND:
                    var bandLeft = stack[sp - 2];
                    var bandRight = stack[sp - 1];
                    stack[sp - 2] = (bandLeft > 0.00001 || bandLeft < -0.00001)
                            && (bandRight > 0.00001 || bandRight < -0.00001) ? 1 : 0;
                    sp--;
                    break;
                case OP_BOR:
                    var borLeft = stack[sp - 2];
                    var borRight = stack[sp - 1];
                    stack[sp - 2] = (borLeft > 0.00001 || borLeft < -0.00001)
                            || (borRight > 0.00001 || borRight < -0.00001) ? 1 : 0;
                    sp--;
                    break;
                case OP_EQUAL:
                    stack[sp - 2] = Math.abs((stack[sp - 2] || 0) - (stack[sp - 1] || 0)) < 0.00001 ? 1 : 0;
                    sp--;
                    break;
                case OP_BITAND:
                    stack[sp - 2] = Math.floor(stack[sp - 2] || 0) & Math.floor(stack[sp - 1] || 0);
                    sp--;
                    break;
                case OP_BITOR:
                    stack[sp - 2] = Math.floor(stack[sp - 2] || 0) | Math.floor(stack[sp - 1] || 0);
                    sp--;
                    break;
                case OP_GETOSC1:
                    stack[sp - 1] = readOsc(host, stack[sp - 1] || 0);
                    break;
                case OP_GETSPEC1:
                    stack[sp - 1] = readSpec(host, stack[sp - 1] || 0, 0, 0);
                    break;
            }
        }
    }

    function readOsc(host, position) {
        if (!host) {
            return 0;
        }
        var samplePosition = position - Math.floor(position);
        var waveform = host.waveformSamples;
        var rms = host.rms || 0;
        if (!waveform || !waveform.length) {
            return Math.sin((host.visualTimeSeconds || 0) * 2.4 + samplePosition * Math.PI * 2) * rms;
        }
        var index = Math.max(0, Math.min(waveform.length - 1, Math.round(samplePosition * (waveform.length - 1))));
        var sample = waveform[index];
        if (Math.abs(sample) < 0.0001 && rms > 0.02) {
            return Math.sin((host.visualTimeSeconds || 0) * 2.4 + samplePosition * Math.PI * 2) * rms;
        }
        return sample || 0;
    }

    function readSpec(host, position, band, channel) {
        if (!host) {
            return 0;
        }
        if (typeof host.getspec === "function") {
            return finite(host.getspec(position || 0, band || 0, channel || 0));
        }
        var samplePosition = position - Math.floor(position);
        var spectrum = host.spectrumSamples;
        if (spectrum && spectrum.length) {
            var index = Math.max(0, Math.min(spectrum.length - 1,
                    Math.round(samplePosition * (spectrum.length - 1))));
            return finite(spectrum[index] || 0);
        }
        var rms = host.rms || 0;
        return finite(Math.abs(Math.sin((host.visualTimeSeconds || 0) * 1.7
                + samplePosition * Math.PI * 8)) * rms);
    }

    function compileSlotProgram(source, variableIndex) {
        var body = new Parser(tokenize(source || "")).parseProgram();
        var ops = [];
        for (var index = 0; index < body.length; index++) {
            compileStatementSlots(body[index], ops, variableIndex);
        }
        var bytecode = new Float64Array(ops);
        var stack = new Float64Array(512);
        return {
            statementCount: body.length,
            opCount: bytecode.length,
            run: function (scope, host) {
                runSlotBytecode(bytecode, stack, scope.values, host);
                return scope;
            }
        };
    }

    function compileSuite(sources) {
        var variableMap = Object.create(null);
        var variableNames = [];
        var variableIndex = createVariableIndexer(variableMap, variableNames);
        var suite = {
            init: compileSlotProgram(sources.init, variableIndex),
            frame: compileSlotProgram(sources.frame, variableIndex),
            beat: compileSlotProgram(sources.beat, variableIndex),
            point: compileSlotProgram(sources.point, variableIndex),
            createScope: function (initialValues) {
                var values = new Float64Array(variableNames.length);
                for (var name in initialValues) {
                    if (Object.prototype.hasOwnProperty.call(initialValues, name)
                            && Object.prototype.hasOwnProperty.call(variableMap, name.toLowerCase())) {
                        values[variableMap[name.toLowerCase()]] = finite(Number(initialValues[name]));
                    }
                }
                return { values: values };
            },
            get: function (scope, name) {
                var key = name.toLowerCase();
                return Object.prototype.hasOwnProperty.call(variableMap, key)
                        ? scope.values[variableMap[key]]
                        : 0;
            },
            getSlot: function (scope, slot) {
                return slot >= 0 ? scope.values[slot] : 0;
            },
            set: function (scope, name, value) {
                var key = name.toLowerCase();
                if (Object.prototype.hasOwnProperty.call(variableMap, key)) {
                    scope.values[variableMap[key]] = finite(Number(value));
                }
            },
            setSlot: function (scope, slot, value) {
                if (slot >= 0) {
                    scope.values[slot] = finite(Number(value));
                }
            },
            slots: function (names) {
                var slots = {};
                for (var index = 0; index < names.length; index++) {
                    var key = names[index].toLowerCase();
                    slots[names[index]] = Object.prototype.hasOwnProperty.call(variableMap, key)
                            ? variableMap[key]
                            : -1;
                }
                return slots;
            },
            variableCount: function () {
                return variableNames.length;
            }
        };
        return suite;
    }

    function compile(source) {
        var body = new Parser(tokenize(source || "")).parseProgram();
        var ops = [];
        for (var index = 0; index < body.length; index++) {
            compileStatement(body[index], ops);
        }
        var stack = new Float64Array(512);
        return {
            statementCount: body.length,
            opCount: ops.length,
            run: function (scope, host) {
                return runBytecode(ops, stack, scope, host);
            }
        };
    }

    window.braviaAvsEel = {
        compile: compile,
        compileSuite: compileSuite
    };
}());
