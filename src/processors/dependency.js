'use strict';

var _ = require('lodash');

/**
 * @dgProcessor dependencyProcessor
 * @description Compiles a list of relevant dependency meta data
 */
module.exports = function dependencyProcessor(log) {

    /**
     * @description Method regular expression
     * 
     * 1. Method name
     * 2. Optional promise chain method name
     */
    var _methodRegularExpression = '\\s*\\.\\s*(\\$?[A-Za-z0-9_]+)\\s*\\([^\\)]+\\)(?:\\s*\\.\\s*(then|catch|finally)\\s*\\()?';
                                  //00000000000111111111111111111100000000000000000000000000000002222222222222222222200000000

    return {
        $runAfter: ['tags-extracted'],
        $runBefore: ['rendering-docs'],
        $process: function(docs) {
            docs.forEach(function(doc) {
                var additionalVariables = [];
                var dependencies = {
                    spies: [],
                    ngMock: {},
                    variables: []
                };

                if (typeof doc.requires !== 'undefined') {
                    _.sortBy(doc.requires, function(require) {
                        return require;
                    }).forEach(function(dependency) {
                        var chainedMethods = {};
                        var dependencyObject;
                        var match;
                        var methods = [];
                        var methodName;
                        var methodSpies = [];
                        var regularExpression;

                        regularExpression = new RegExp(
                            (isInternalService(dependency) ? '\\' : '') + dependency + _methodRegularExpression,
                            'g'
                        );

                        while (match = regularExpression.exec(doc.fileInfo.content)) {
                            methodName = match[1];

                            methods.push(methodName);

                            if (match[2]) {
                                if (typeof chainedMethods[methodName] === 'undefined') {
                                    chainedMethods[methodName] = [];
                                }

                                chainedMethods[methodName].push(match[2]);
                            }
                        }

                        for (methodName in chainedMethods) {
                            dependencyObject = createDependencyObject(
                                dependency + methodName.charAt(0).toUpperCase() + methodName.slice(1),
                                chainedMethods[methodName]
                            );

                            dependencyObject.methodName = methodName;

                            methodSpies.push(dependencyObject);
                            additionalVariables.push(dependencyObject.variable);
                        }

                        dependencies.spies.push(createDependencyObject(
                            dependency,
                            methods,
                            methodSpies
                        ));
                    });

                    pushVariables(dependencies, _.map(dependencies.spies, 'variable'));
                    pushVariables(dependencies, additionalVariables.sort());
                }

                log.debug('Compiled ' + dependencies.spies.length + ' dependencies');

                doc.dependencies = dependencies;
            });
        }
    };

    /**
     * @name dependencyProcessor#createDependencyObject
     * @description Returns the variable name for the specified dependency
     * @param {String} dependency
     * @param {Array} [methods] Array of string method names
     * @param {Array} [methodSpies] Array of chained method spies
     * @returns {Object}
     */
    function createDependencyObject(dependency, methods, methodSpies) {
        var areMethodsUndefined = typeof methods === 'undefined';

        if (areMethodsUndefined) {
            methods = [];
        }

        if (typeof methodSpies === 'undefined') {
            methodSpies = [];
        }

        methods = _.sortedUniq(methods.sort());

        methods = "'" + methods.join("', '") + "'";

        return {
            name: dependency,
            methods: methods,
            methodSpies: methodSpies.sort(getCompareFunction('name')),
            variable: getVariableName(dependency, !areMethodsUndefined) // Append "Spy" if `methods` was defined
        };
    }

    /**
     * @name dependencyProcessor#getCompareFunction
     * @description Returns the compare function for the specified property 
     * @param {String} property Property to compare on
     * @returns {Function}
     */
    function getCompareFunction(property) {
        return function(a, b) {
            if (a[property] < b[property]) {
                return -1;
            }

            if (a[property] > b[property]) {
                return 1;
            }

            return 0;
        };
    }

    /**
     * @name dependencyProcessor#getVariableName
     * @description Returns the variable name for the specified dependency
     * @param {String} dependency
     * @param {Boolean} [appendSpy=true] Whether or not "Spy" is appended to variable name
     * @returns {Boolean}
     */
    function getVariableName(dependency, appendSpy) {
        if (isInternalService(dependency)) {
            dependency = dependency.substr(1);
        }

        if (typeof appendSpy === 'undefined' || appendSpy) {
            dependency += 'Spy';
        }

        return dependency;
    }

    /**
     * @name dependencyProcessor#isInternalService
     * @description Determines if the specified dependency is an internal service
     * @param {String} dependency
     * @returns {Boolean}
     */
    function isInternalService(dependency) {
        return dependency.charAt(0) === '$';
    }

    /**
     * @name dependencyProcessor#pushVariables
     * @description Pushes the specified variables onto the `dependencies` data structure
     * @param {Object} dependencies
     * @param {Array} variables
     */
    function pushVariables(dependencies, variables) {
        if (variables.length === 0) {
            return;
        }

        dependencies.variables.push([]);

        Array.prototype.push.apply(
            dependencies.variables[dependencies.variables.length - 1],
            variables
        );
    }

};
