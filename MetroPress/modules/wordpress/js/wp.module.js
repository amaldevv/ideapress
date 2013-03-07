﻿// MetroPress Wordpress JSON API module
// Created By IdeaNotion
//
var wordpressModule = function (metroPress, options) {
    this.list = new WinJS.Binding.List();
    this.metroPress = metroPress;
    this.localStorageBookmarkKey = "wp-bookmark";
    this.userAgent = 'wp-window8';
    this.bookmarks = null;
    this.fetching = false;

    // set options
    this.localStorageKey = "wp-" + options.categoryId;
    this.title = options.title;
    this.categoryId = options.categoryId;
    this.pageIds = options.pageIds;
    this.apiURL = options.apiUrl,
        // set constant
    this.defaultCount = 32;
    this.numberOfRelatedPosts = 4;
    this.maxPagingIndex = -1;

    return this;
};

// Constants
wordpressModule.BOOKMARKS = -1;
wordpressModule.MOSTRECENT = -2;
wordpressModule.PAGES = -3;
wordpressModule.fetching = false;

/* 
============================================================================     External Methods     =============================================================//
*/

// Render main section with html
wordpressModule.prototype.render = function(elem) {
    var self = this;
    this.container = elem;
    return new WinJS.Promise(function(comp, err, prog) {
        var pageLocation = "/modules/wordpress/pages/wp.module.html";
        WinJS.UI.Fragments.renderCopy(pageLocation, elem).done(
            function() {
                WinJS.UI.processAll(elem);
                self.loader = elem.querySelector("progress");
                metroPress.toggleElement(self.loader, "show");
                comp();
            },
            function() {
                err();
            }, function () {
                prog();
            }
        );
    });
};

// Fetch data and update UI
wordpressModule.prototype.update = function(viewState) {
    var self = this;
    
    if (false !== self.fetching) {
        self.fetching.cancel();
    }
    
    self.fetching = self.fetch(0).then(function () {
        var listViewLayout;

        if (self.categoryId == wordpressModule.BOOKMARKS) {
            if (self.list.length == 0) {
                var content = self.container.querySelector(".mp-module-content");
                content.parentNode.className = content.parentNode.className + ' hide';
                return;
            }
        }

        // set module title
        var title = self.container.querySelector(".wp-title");
        title.onclick = WinJS.Utilities.markSupportedForProcessing(function() {
            self.showCategory();
        });
        var titleCount = self.container.querySelector(".wp-title-count");        

        // no header for page
        if (self.categoryId !== wordpressModule.PAGES) {
            title.textContent = self.title;
            titleCount.textContent = Math.max(self.list.length, self.totalCount);
        }        

        // set layout type
        if (viewState === Windows.UI.ViewManagement.ApplicationViewState.snapped) {
            title.textContent = '';
            titleCount.textContent = '';
            listViewLayout = new WinJS.UI.ListLayout();
        } else {
            listViewLayout = new WinJS.UI.GridLayout({
                groupInfo: function() {
                    return {
                        enableCellSpanning: true,
                        cellWidth: 10,
                        cellHeight: 10
                    };
                }
            });
        }

        // bind to list
        var listview = self.container.querySelector('.wp-list').winControl;
        WinJS.UI.setOptions(listview, {
            itemDataSource: self.getHubList().dataSource,
            itemTemplate: self.container.querySelector('.wp-post-template'),
            selectionMode: 'none',
            swipeBehavior: 'none',
            layout: listViewLayout,
            item: self
        });               
        listview.oniteminvoked = function (e) { self.showPost(e) };
        self.fetching = false;
    }, function () {
        self.fetching = false;
    }, function () {
    });

};

// Refresh data and update UI
wordpressModule.prototype.refresh = function(viewState) {
    var self = this;

    self.cancel();

    metroPress.toggleElement(self.loader, "show");

    var listLength = self.list.length;
    for (var i = 0; i < listLength; i++)
        self.list.pop();

    self.container.querySelector('.wp-list').winControl.itemDataSource = null;

    self.loadFromStorage[this.localStorageKey] = null;
    self.update(viewState);

};

// Cancel any WinJS.xhr in progress
wordpressModule.prototype.cancel = function() {
    if (this.fetching)
        this.fetching.cancel();
};

// Search Charm initialization
wordpressModule.prototype.searchInit = function () {
    var appModel = Windows.ApplicationModel;
    var nav = WinJS.Navigation;
    appModel.Search.SearchPane.getForCurrentView().onquerysubmitted = function (args) { nav.navigate('/modules/wordpress/pages/wp.module.searchResults.html', args); };

};

// Live Tile
wordpressModule.prototype.getLiveTileList = function () {
    var queryString = '?json=get_recent_posts&count=5&page=1';
    var fullUrl = this.apiURL + queryString;
    var headers = { "User-Agent": this.userAgent };
    var self = this;
    return new WinJS.Promise(function (comp, err, prog) {

        WinJS.xhr({ type: 'GET', url: fullUrl, headers: headers }).then(function (r) {
            var data = JSON.parse(r.responseText);
            if (data.status != "ok" || data.count <= 0) {
                err();
                return;
            }

            var items = self.addItemsToList(data.posts);
            comp(items);
        },
            function (e) {
                err(e);
            },
            function (p) {
                prog(p);
            });
    });
};

/* 
============================================================================     Module Internal Methods     =============================================================//
*/


// Fetch pages, posts or bookmarks
wordpressModule.prototype.fetch = function(page) {
    var self = this;       

    return new WinJS.Promise(function(comp, err, prog) {
        var url = self.apiURL;
        var queryString;

        // branch off to get pages, posts or bookmark based on categoryId
        if (self.categoryId == wordpressModule.PAGES) {
            self.getPages().then(function() {
                comp();
                return;
            }, function () {
                localStorageObject = self.loadFromStorage();
                if (localStorageObject != null && localStorageObject.pages != null) {
                    var pages = localStorageObject.pages;

                    self.addPagesToList(pages);
                }

                comp();
                metroPress.toggleElement(self.loader, "hide");
            },
            function(p) {
                    prog(p);
                });
            return;
        } else if (self.categoryId == wordpressModule.BOOKMARKS) {           

            // read from bookmark and store to the list
            var bookmarks = self.getBookmarks();
            self.post_count = bookmarks.post_count;
            self.lastFetched = bookmarks.lastFetched;

            var listLength = self.list.length;
            for (var i = 0; i < listLength; i++) {
                self.list.pop();
            }

            for (i = 0; i < bookmarks.posts.length; i++) {
                bookmarks.posts[i].module = self;
                self.list.push(bookmarks.posts[i]);
            }
            self.totalCount = bookmarks.posts.length;
            metroPress.toggleElement(self.loader, "hide");
            comp();
            return;
        } else {
            // fetch Posts            
            if (self.categoryId == wordpressModule.MOSTRECENT)
                queryString = '?json=get_recent_posts&count=' + self.defaultCount + "&page=" + (page + 1);
            else
                queryString = '?json=get_category_posts&id=' + self.categoryId + '&count=' + self.defaultCount + "&page=" + (page + 1);

            var fullUrl = url + queryString;
            var headers = { "User-Agent": self.userAgent };
            var localStorageObject = self.loadFromStorage();

            if (self.shouldFetch(localStorageObject, page)) {
                WinJS.xhr({ type: 'GET', url: fullUrl, headers: headers }).then(function(r) {
                    var data = JSON.parse(r.responseText);
                    if (data.status != "ok" || data.count == 0) {
                        // no data
                        self.maxPagingIndex = 0;
                        comp();
                        return;
                    }

                    if (data.category != null) {
                        self.totalCount = data.category.post_count;
                    } else {
                        self.totalCount = data.count_total;
                    }

                    if (data.count > 0) {
                        self.addItemsToList(data.posts);
                        localStorageObject = { 'post_count': self.totalCount, 'posts': [], 'lastFetched': new Date() };

                        for (var item in data.posts) {
                            localStorageObject.posts.push(data.posts[item]);
                        }
                        self.saveToStorage(localStorageObject);
                        self.maxPagingIndex = page;
                    }
                                        
                    comp();
                    metroPress.toggleElement(self.loader, "hide");
                    return;
                },
                function(m) {
                    localStorageObject = self.loadFromStorage();
                    if (localStorageObject != null && localStorageObject.posts != null)
                        self.addItemsToList(localStorageObject.posts);
                    
                    metroPress.toggleElement(self.loader, "hide");
                    err(m);
                },
                function(p) {
                    prog(p);
                });
            } else {
                // local from local storage
                if (!localStorageObject) {
                    err();
                    return;
                }
                self.addItemsToList(localStorageObject.posts);

                self.lastFetched = localStorageObject.lastFetched;
                self.totalCount = localStorageObject.post_count;                
                comp();
                metroPress.toggleElement(self.loader, "hide");
            }
        }
    });
};

// Get pages data using JSON API
wordpressModule.prototype.getPages = function () {
    var self = this;
    return new WinJS.Promise(function (comp, err, prog) {

        var url = self.apiURL;
        var queryString = '?json=get_page&id=';

        var fullUrl = url + queryString;
        var headers = { "User-Agent": self.userAgent };
        var localStorageObject = self.loadFromStorage();

        if (!self.shouldFetch(localStorageObject)) {
            self.addPagesToList(localStorageObject.pages);

            self.lastFetched = localStorageObject.lastFetched;
            self.totalCount = localStorageObject.page_count;            
            comp();
            metroPress.toggleElement(self.loader, "hide");

        } else {
            var promises = [];
            var pageData = new Array();
            for (var i in self.pageIds) {
                promises.push(WinJS.xhr({ type: 'GET', url: fullUrl + self.pageIds[i], headers: headers }).then(function(r) {
                    var data = JSON.parse(r.responseText);
                    pageData.push(data.page);
                    metroPress.toggleElement(self.loader, "hide");
                }, function() { err(); }, function() { prog(); }));
            }
            WinJS.Promise.join(promises).then(function () {
                if (pageData.length > 0) {
                    localStorageObject = { 'page_count': pageData.length, 'pages': pageData, 'lastFetched': new Date() };


                    self.addPagesToList(pageData);
                    self.saveToStorage(localStorageObject);
                }
                comp();
            },
            function () {
                err();
            },
            function(p) {
                prog(p);
            });
        }
    });

};

// Search text using JSON API 
wordpressModule.prototype.search = function (query) {
    var self = this;

    return new WinJS.Promise(function (comp, err, prog) {
        prog(0);

        var queryString = '?json=get_search_results&count=20&search=' + query;

        var fullUrl = self.apiURL + queryString;
        var headers = { "User-Agent": self.userAgent };

        if (false !== self.fetching) {
            self.fetching.cancel();
        }

        self.fetching =
            WinJS.xhr({ type: 'GET', url: fullUrl, headers: headers }).then(function (r) {
                var data = JSON.parse(r.responseText);
                self.list = new WinJS.Binding.List();
                self.addItemsToList(data.posts);

                self.fetching = false;
                comp(self.list);
            }, function (e) { err(e); }, function (p) { prog(p); });
    });
};

// Check if the app should fetch data
wordpressModule.prototype.shouldFetch = function (localStorageObject, page) {    
    if (localStorageObject) {
        if (page && (page > this.maxPagingIndex)) {
            return true;
        }
        if (this.categoryId == wordpressModule.PAGES) {
            if (localStorageObject.pages && localStorageObject.pages.length > 0) {
                if (new Date() - new Date(localStorageObject.lastFetched) < 360000) {
                    return false;
                }
            }
        } else {
            if (localStorageObject.posts && localStorageObject.posts.length > 0) {
                if (new Date() - new Date(localStorageObject.lastFetched) < 360000) {
                    return false;
                }
            }
        }
    }
    return true;

};

// Load from local storage
wordpressModule.prototype.loadFromStorage = function() {
    if (localStorage[this.localStorageKey] != null) {
        var localStorageObject = JSON.parse(localStorage[this.localStorageKey]);
        self.lastFetched = localStorageObject.lastFetched;
        return localStorageObject;
    }
    return null;
};

// Save to the local storage
wordpressModule.prototype.saveToStorage = function(data) {

    localStorage[this.localStorageKey] = JSON.stringify(data);
};

// Navigate to Detail page
wordpressModule.prototype.showPost = function(eventObject) {
    var i = this.list.getAt(eventObject.detail.itemIndex);
    WinJS.Navigation.navigate("/modules/wordpress/pages/wp.module.detail.html", { item: i });
};

// Navigate to Section page
wordpressModule.prototype.showCategory = function() {
    if (this.fetching)
        this.fetching.cancel();

    WinJS.Navigation.navigate("/modules/wordpress/pages/wp.module.section.html", { category: this });    
};

// Generate the list for hub page
wordpressModule.prototype.getHubList = function() {
    var hubList = new WinJS.Binding.List();

    var h = window.innerHeight;
    var l = 6;
    if (h > 1919)
        l = 12;
    else if (h > 1199)
        l = 8;

    for (var i = 0; i < Math.min(l, this.list.length); i++)
        hubList.push(this.list.getAt(i));

    return hubList;
};

// Post Comment
wordpressModule.prototype.submitComment = function(postId, name, email, url, comment, c, r, p) {
    var fullUrl = this.apiURL + '?json=submit_comment&post_id=' + postId + '&name=' + encodeURI(name) + '&email=' + encodeURI(email) + '&content=' + encodeURI(comment);
    var headers = { "User-Agent": this.userAgent };
    
    WinJS.xhr({ type: "POST", url: fullUrl, headers: headers }).done(
        function (result) {
            c(result);
        },
        function (result) {
            r(result);
        },
        function (result) {
            p(result);
        }
    );
};

// Add posts to the list
wordpressModule.prototype.addItemsToList = function(jsonPosts) {
    var self = this;
    var itemArray = new Array();
    for (var key in jsonPosts) {
        var item = self.convertItem(jsonPosts[key]);
        
        item.module = self;
        item.categories = jsonPosts[key].categories;
        item.className = "wp-item wp-item-" + key;

        var insert = true;
        self.list.forEach(function(value) {
            if (value.id == item.id) {
                insert = false;
            }
        });
        if (insert) {
            self.list.push(item);
            itemArray.push(item);
        }
    }
    return itemArray;
};

// Add pages to the list
wordpressModule.prototype.addPagesToList = function(jsonPages) {
    var self = this;
    var itemArray = new Array();


    for (var index in jsonPages) {
        var item = self.convertPage(jsonPages[index]);
        item.module = self;

        item.className = "wp-item wp-item-" + index;

        var insert = true;
        self.list.forEach(function(value) {
            if (value.id == item.id) {
                insert = false;
            }
        });
        if (insert) {
            self.list.push(item);
            itemArray.push(item);
        }
    }
    return;
};

// Translate Post to local object
wordpressModule.prototype.convertItem = function(item, type) {
    var res = {
        type: type,
        title: metroPress.decodeEntities(item.title),
        id: item.id,
        content: item.content,
        timestamp: item.date.substr(0, 10),
        permalink: item.url.replace(/^https:/, 'http:'),
        date: item.date.replace(' ', 'T'),
        authorId: item.author.id,
        authorName: item.author.name,
        comments: item.comments
    };

    // get the first image from attachments
    res.imgUrl = 'ms-appx:/images/blank.png';


    for (var i in item.attachments) {
        if (item.attachments[i].url != "") {
            res.imgUrl = item.attachments[i].url;
            break;
        } else if (item.attachments[i].images != null) {
            res.imgUrl = item.attachments[i].images.full.url;
            break;
        }
    }


    var imgUrlStyle = res.imgUrl;
    res.imgUrlStyle = "url('" + imgUrlStyle + "')";

    var subtitle = '';
    if (item.categories) {
        for (var j in item.categories) {
            subtitle = subtitle + ', ' + metroPress.decodeEntities(item.categories[j].title);
        }
        res.subtitle = subtitle.substring(2);
    }

    return res;

};

// Translate Page to local object
wordpressModule.prototype.convertPage = function(item, parentId) {
    var res = {
        type: 'page',
        title: metroPress.decodeEntities(item.title),
        id: item.id,
        content: item.content,
        timestamp: item.date.substr(0, 10),
        permalink: item.url.replace(/^https:/, 'http:'),
        date: item.date.replace(' ', 'T'),
        authorId: item.author.id,
        authorName: item.author.name,
        comments: item.comments,
        parentId: parentId,
        hasChildren: false
    };

    // get the first image from attachments
    res.imgUrl = 'ms-appx:/images/blank.png';
    for (var i in item.attachments) {
        if (item.attachments[i].url != "") {
            res.imgUrl = item.attachments[i].url;
            break;
        } else if (item.attachments[i].images != null) {
            res.imgUrl = item.attachments[i].images.full.url;
            break;
        }
    }

    var imgUrlStyle = res.imgUrl;
    res.imgUrlStyle = "url('" + imgUrlStyle + "')";
    res.subtitle = "";

    return res;
};

// Get Bookmarks from local storage
wordpressModule.prototype.getBookmarks = function() {
    var self = this;
    if (!localStorage[self.localStorageBookmarkKey]) {
        localStorage[self.localStorageBookmarkKey] = JSON.stringify({ 'post_count': 0, 'posts': [], 'lastFetched': new Date() });
    }

    this.bookmarks = JSON.parse(localStorage[self.localStorageBookmarkKey]);
    return this.bookmarks;
};

// Check if a post has been bookmarked
wordpressModule.prototype.checkIsBookmarked = function(id) {
    var bookmarks = this.getBookmarks();
    for (var index in bookmarks.posts) {
        if (id == bookmarks.posts[index].id)
            return true;
    }
    return false;
};

// Add post to bookmark
wordpressModule.prototype.addBookmark = function(item) {
    var self = this;
    var bookmarks = self.getBookmarks();
    for (var index in bookmarks.posts) {
        if (item.id == bookmarks.posts[index].id) {
            return;
        }
    }
    item.module = null;
    bookmarks.posts.push(item);
    bookmarks.post_count = bookmarks.posts.length;
    localStorage[self.localStorageBookmarkKey] = JSON.stringify(bookmarks);
};

// Remove post to bookmark
wordpressModule.prototype.removeBookmark = function(id) {
    var self = this;
    var bookmarks = self.getBookmarks();
    for (var index in bookmarks.posts) {
        if (id == bookmarks.posts[index].id) {
            bookmarks.posts.splice(index, 1);
            break;
        }
    }
    bookmarks.post_count = bookmarks.posts.length;
    localStorage[self.localStorageBookmarkKey] = JSON.stringify(bookmarks);
};