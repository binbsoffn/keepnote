// Mock async calls.
function mockAsync($, name, mockFunc) {
    var original = $[name];

    spyOn($, name).and.callFake(function () {
        // arguments.
        var args = arguments;
        var config = args[0];
        var defer = $.Deferred().done(function () {
            if (config.success)
                config.success.apply(null, arguments);
        }).fail(function () {
            if (config.error)
                config.error.apply(null, arguments);
        });

        setTimeout(function () {
            var result;
            try {
                result = mockFunc.apply(null, args);
                defer.resolve(result);
            } catch (err) {
                defer.reject(err);
            }
        }, 0);

        return defer;
    });
}


function MockServer() {
    this.nodes = {};
    this.rootids = {};
    this.nodeid = 1;
    this.debug = false;
    this.ajax = null;

    // Mock ajax to use server.
    this.start = function () {
        mockAsync($, 'ajax', function (config) {
            if (this.ajax) {
                // See if custom mock wants to handle ajax call.
                var result = this.ajax(config);
                if (typeof result !== 'undefined')
                    return result;
            }
            // Default to builtin mock handler.
            return this.send(config);
        }.bind(this));
    };

    this.send = function(config) {
        var match;
        var method = config.type.toUpperCase();
        if (this.debug)
            console.log('==', config);

        if (method == 'GET') {
            // Get root id.
            match = config.url.match(/^\/notebook\/nodes\/$/);
            if (match) {
                return {
                    rootids: this.rootids
                };
            }

            // Get node.
            match = config.url.match(/^\/notebook\/nodes\/([^\/]+)$/);
            if (match) {
                var nodeid = match[1];
                return this.nodes[nodeid];
            }

            // Get node file.
            match = config.url.match(/^\/notebook\/nodes\/([^\/]+)\/(.+)$/);
            if (match) {
                return '';
            }

            throw 'unknown';

        } else if (method == 'POST' || method == 'PUT') {
            // Create new node.
            match = config.url.match(/^\/notebook\/nodes\/$/);
            if (match) {
                var nodeid = (++this.nodeid) + '';
                var attr = JSON.parse(config.data);
                attr["nodeid"] = nodeid;
                this.nodes[nodeid] = attr;
                return attr;
            }

            // Update node.
            match = config.url.match(/^\/notebook\/nodes\/([^\/]+)$/);
            if (match) {
                var nodeid = match[1];
                var attr = JSON.parse(config.data);
                attr.nodeid = nodeid;
                this.nodes[nodeid] = attr;
                return attr;
            }

            // Create/update file.
            match = config.url.match(/^\/notebook\/nodes\/([^\/]+)\/(.+)$/);
            if (match) {
                return;
            }

            throw 'unknown';
        } else if (method == 'HEAD') {
            match = config.url.match(/^\/static\/images\/node_icons\/(.+)$/);
            if (match) {
                return;
            }

            match = config.url.match(/^\/notebook\/nodes\/([^\/]+)\/(.+)$/);
            if (match) {
                return;
            }

            throw 'unknown';
        }
    };
}


describe("Test notebook data store", function() {

    beforeEach(function() {
    });

    it("Can read root node and add one child", function(done) {
        var jsdom = require('jsdom');
        var html = '<html></html>';

        jsdom.env(html, function (errors, window) {
            $ = require('jquery')(window);
            Backbone = require('backbone');
            Backbone.$ = $;
            book = require('../../js/notebook.js');
            NoteBook = book.NoteBook;

            var ajax = function (config) {};
            mockAsync($, "ajax", function () {
                return ajax.apply(null, arguments);
            });

            var rootid = 123;
            var notebook = new NoteBook({rootid: rootid});

            var attr = {
                nodeid: 123,
                title: "My node",
                parentids: [],
                childrenids: []
            };
            var childAttr = {
                "content_type": "text/xhtml+xml",
                "title": "New Page",
                "parentids": [123],
                "childrenids": [],
                "order": 0
            };
            var childAttrWithId = {
                "nodeid": 456,
                "content_type": "text/xhtml+xml",
                "title": "New Page",
                "parentids": [123],
                "childrenids": [],
                "order": 0
            };
            var attrWithChild = {
                "nodeid": 123,
                "title": "My node",
                "parentids": [],
                "childrenids": [456]
            };

            ajax = function (config) {
                expect(config.url).toEqual('/notebook/nodes/123');
                return attr;
            };
            notebook.fetch().then(function (value) {
                // Ensure root node saved correctly.
                expect(notebook.root.attributes).toEqual(attr);

                ajax = function (config) {
                    if (config.url == '/notebook/nodes/' &&
                        config.type == 'POST') {
                        var data = JSON.parse(config.data);
                        expect(data).toEqual(childAttr);

                        return {
                            nodeid: 456
                        };
                    } else if (config.url == '/notebook/nodes/123' &&
                               config.type == 'PUT') {
                        var data = JSON.parse(config.data);
                        expect(data).toEqual(attrWithChild);

                    } else if (config.url == '/notebook/nodes/456' &&
                               config.type == 'PUT') {
                        var data = JSON.parse(config.data);
                        // Update order.

                    } else if (config.url == '/notebook/nodes/456/page.html' &&
                               config.type.toUpperCase() == 'POST') {
                        expect(config.data)
                            .toEqual("<html><body></body></html>");

                    } else if (config.url == '/notebook/nodes/123' &&
                               config.type == 'GET') {
                        return attrWithChild;

                    } else if (config.url == '/notebook/nodes/456' &&
                               config.type == 'GET') {
                        return childAttr;

                    } else {
                        throw "Unexpected request:" + JSON.stringify(config)
                    }
                };
                return notebook.newNode(notebook.root);
            }).then(function () {
                var nodeids = Object.keys(notebook.nodes);
                expect(nodeids).toEqual(['123', '456']);

                expect(notebook.root.attributes)
                    .toEqual(attrWithChild);
                expect(notebook.root.children[0].attributes)
                    .toEqual(childAttrWithId);

                done();
            });
        });
    });

    it("Add multiple children nodes", function(done) {
        var jsdom = require('jsdom');
        var html = '<html></html>';

        jsdom.env(html, function (errors, window) {
            $ = require('jquery')(window);
            Backbone = require('backbone');
            Backbone.$ = $;
            book = require('../../js/notebook.js');
            NoteBook = book.NoteBook;

            // Setup local notebook;
            var rootid = 1;
            var notebook = new NoteBook({rootid: rootid});

            // Setup mock server;
            var server = new MockServer();
            server.start();
            server.rootid = [rootid];
            server.nodes[rootid] = {
                nodeid: rootid,
                title: "My node",
                parentids: [],
                childrenids: []
            };

            notebook.fetch().then(function (value) {
                return notebook.newNode(notebook.root, null);
            }).then(function () {
                return notebook.newNode(notebook.root, null);
            }).then(function () {
                expect(notebook.root.children.length).toEqual(2);
                done();
            });
        });
    });

    it("Move nodes", function(done) {
        var jsdom = require('jsdom');
        var html = '<html></html>';

        jsdom.env(html, function (errors, window) {
            $ = require('jquery')(window);
            Backbone = require('backbone');
            Backbone.$ = $;
            book = require('../../js/notebook.js');
            NoteBook = book.NoteBook;

            // Setup local notebook;
            var rootid = '1';
            var notebook = new NoteBook({rootid: rootid});

            // Setup mock server;
            var server = new MockServer();
            server.start();
            server.rootid = [rootid];
            server.nodes = {
                1: {
                    nodeid: '1',
                    title: "My node",
                    parentids: [],
                    childrenids: ['2', '3'],
                    expanded: true
                },
                2: {
                    nodeid: '2',
                    parentids: ['1'],
                    childrenids: [],
                    expanded: true
                },
                3: {
                    nodeid: '3',
                    parentids: ['1'],
                    childrenids: [],
                    expanded: true
                }
            };

            notebook.root.fetchExpanded().then(function () {
                var node = notebook.nodes[2];
                var node2 = notebook.nodes[3];
                node.move({
                    parent: node2,
                    index: null
                }).then(function () {
                    expect(node2.children).toEqual([node]);
                    done();
                });
            });
        });
    });

    it("Move nodes within same parent", function(done) {
        var jsdom = require('jsdom');
        var html = '<html></html>';

        jsdom.env(html, function (errors, window) {
            $ = require('jquery')(window);
            Backbone = require('backbone');
            Backbone.$ = $;
            book = require('../../js/notebook.js');
            NoteBook = book.NoteBook;

            // Setup local notebook;
            var rootid = '1';
            var notebook = new NoteBook({rootid: rootid});

            // Setup mock server;
            var server = new MockServer();
            server.start();
            server.rootid = [rootid];
            server.nodes = {
                1: {
                    nodeid: '1',
                    title: "My node",
                    parentids: [],
                    childrenids: ['2', '3'],
                    expanded: true
                },
                2: {
                    nodeid: '2',
                    parentids: ['1'],
                    childrenids: [],
                    expanded: true
                },
                3: {
                    nodeid: '3',
                    parentids: ['1'],
                    childrenids: [],
                    expanded: true
                }
            };

            // Move node 2 after node 3.
            notebook.root.fetchExpanded().then(function () {
                var node2 = notebook.nodes[2];
                var node3 = notebook.nodes[3];
                return node2.move({
                    target: node3,
                    relation: 'after'
                });
            }).then(function () {
                // Ensure children ids have been updated on parent.
                expect(notebook.root.get('childrenids'))
                    .toEqual(['3', '2']);

                // Ensure new order attr have been set.
                var orders = [
                    notebook.root.children[0].get('order'),
                    notebook.root.children[1].get('order')
                ];
                expect(orders).toEqual([0, 1]);

                // Move a node backwards in the list.
                var node2 = notebook.nodes[2];
                var node3 = notebook.nodes[3];
                return node2.move({
                    target: node3,
                    relation: 'before'
                });
            }).then(function () {
                // Ensure children ids have been updated on parent.
                expect(notebook.root.get('childrenids'))
                    .toEqual(['2', '3']);
                done();
            });
        });
    });

    fit('notebook icons', function (done) {
        var jsdom = require('jsdom');
        var html = '<html></html>';

        jsdom.env(html, function (errors, window) {
            $ = require('jquery')(window);
            Backbone = require('backbone');
            Backbone.$ = $;
            book = require('../../js/notebook.js');
            NoteBook = book.NoteBook;
            icons = require('../../js/icons.js');

            // Setup local notebook;
            var rootid = '1';
            var notebook = new NoteBook({rootid: rootid});

            // Setup mock server;
            var server = new MockServer();
            server.start();
            server.rootid = [rootid];
            server.nodes = {
                1: {
                    nodeid: '1',
                    title: 'My node',
                    parentids: [],
                    childrenids: []
                }
            };

            // Icon paths.
            var notebookIcons = '/notebook/nodes/1/__NOTEBOOK__/icons/';
            var builtinIcons = '/static/images/node_icons/';

            server.ajax = function (config) {
                // Mock notebook icon file.
                if (config.type === 'HEAD' &&
                    config.url === notebookIcons + 'note.png') {
                    return true;
                }

                // Mock builtin icon file.
                if (config.type === 'HEAD' &&
                    config.url === notebookIcons + 'note2.png') {
                    throw 'not found';
                }
                if (config.type === 'HEAD' &&
                    config.url === builtinIcons + 'note2.png') {
                    return true;
                }
            };

            // Test icon filenames.
            var icon = notebook.getIconFilename('note.png');
            expect(icon).toEqual('__NOTEBOOK__/icons/note.png');

            // Track successful tests.
            doneCount = 2;
            var testDone = function () {
                doneCount--;
                if (doneCount === 0)
                    done();
            };

            notebook.root.fetch().done(function () {
                // Ask for notebook-specific icon.
                icons.lookupIconFilename(notebook, 'note.png').done(
                    function (filename) {
                        expect(filename).toEqual(
                            '/notebook/nodes/1/__NOTEBOOK__/icons/note.png');
                        testDone();
                    }
                );

                // Ask for builtin icon.
                icons.lookupIconFilename(notebook, 'note2.png').done(
                    function (filename) {
                        expect(filename).toEqual(
                            '/static/images/node_icons/note2.png');
                        testDone();
                    }
                );
            });
        });
    });
});

