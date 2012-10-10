/*!
 * contactjs
 * https://github.com/jimpurbrick/contactjs
 *
 * Copyright 2012, CCP (http://www.ccpgames.com)
 * Dual licensed under the MIT or GPL Version 2 licenses.
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.opensource.org/licenses/GPL-2.0
 */

/*
 * An example read-write JavaScript CREST application which relies on the structure of specific media types
 * and so always specifies precise, versioned "vnd.ccp.eve.FOO-vN" media types in Accept and Content-Type headers.
 * Applications written in this way can be widely distributed without being continually upgraded and will continue to
 * work until the media types they rely on are no longer supported by CCP.
 */

/*jslint undef: false, browser: true, vars: true, white: true, forin: true, plusplus: true, bitwise: true, eqeq: true, maxerr: 50, indent: 4 */
/*global Handlebars, $ */

(function () { // Start contactjs

    "use strict";
    
    // Configuration parameters
    var server = "http://nginx.jim01.dev"; // API server
    var redirectUri = "https://jimpurbrick.github.com/contactjs/"; // client uri
    var clientId = "contactjs"; // OAuth client id
    var csrfTokenName = clientId + "csrftoken";
    var token; // OAuth token
    var authorizationEndpoint = "http://login.jim01.dev/oauth/Authorize/"; // OAuth endpoint
    var scopes = "personalContactsRead personalContactsWrite corporationContactsRead corporationContactsWrite characterRead";

    // Client side templates
    var contactListTemplate = Handlebars.compile($("#contact-list-template").html());
    var errorTemplate = Handlebars.compile($("#error-template").html());

    // Notification request
    var notificationRequest = undefined;
    var notificationPollTimer = undefined;
    var notificationStartIndex = 0;

    // Map of standing names to values
    var standings = {
        Excellent: 10,
        Good: 5,
        Neutral: 0,
        Bad: -5,
        Terrible: -10
    };

    // Template helper used to render a set of standings options
    Handlebars.registerHelper('standing', function() {
        var standingName, result = "";
        for (standingName in standings) {
            result += "<option";
            if (this.standing === standings[standingName]) {
              result += " selected=\"selected\"";
            }
            result += ">" + standingName + "</option>";
        }
        return new Handlebars.SafeString(result);
    });

    // Template helper used to render a watched checkbox.
    Handlebars.registerHelper('watched', function() {
        var result = "Watched <input type=\"checkbox\" class=\"watched\"";
        if(this.watched === undefined) {
            return "";
        }
        if(this.watched === true) {
            result += "checked=\"yes\"";
        }
        result += "/>";
        return new Handlebars.SafeString(result);
    });

    // Cached uris
    var searchUri;
    var contactListUri;
    var notificationUri;

    // Cached contact list data
    var contactList;

    // Find contact in cached contact list
    function getContact(name) {
        var i;
        for (i = 0; i < contactList.items.length; i++) {
            var contact = contactList.items[i];
            if (contact.contact.name === name) {
                return contact;
            }
        }
        return false;
    }

    // Remove contact from cached contact list
    function removeContact(name) {
        var i;
        for (i = 0; i < contactList.items.length; i++) {
            var contact = contactList.items[i];
            if (contact.contact.name === name) {
                contactList.items.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    function ajaxGet(url, accept, success) {
        accept = "application/" + accept + "+json, charset=utf-8";
        $.ajax(url, {
            headers: {
                Accept: accept
            },
            success: success
        });
    }

    // Remove contact from cache and via api
    function onClickRemove(evt) {
        evt.preventDefault();
        var name = $(evt.target).siblings(".name").html();
        $.ajax($(evt.target).attr("href"), {
            type: "DELETE",
            success: function() {
                // Request succeeded, remove contact from cache.
                if (removeContact(name)) {
                    renderContactList(contactList);
                }
            }
        });
    }

    // Update contact when standing selection is changed
    function onStandingChange(evt) {
        updateContact(evt, {standing: standings[$(evt.target).val()]});
    }

    // Update contact when watched checkbox is clicked
    function onClickWatched(evt) {
        updateContact(evt, {watched: $(evt.target).attr("checked")});
    }

    // Show search dialog when add is clicked
    function onClickAdd(evt) {
        evt.preventDefault();
        $("#searchDialog").dialog({
            resizable: false,
            modal:true,
            buttons: {
                OK: function() {

                    // Get query from dialog
                    var query = $("#query").val();

                    // Search for resources with name matching query
                    $.ajax(searchUri + "?name=" + query, {
                        headers: {
                            Accept: "application/vnd.ccp.eve.Collection-v1+json"
                        },
                        success: function(data) {

                            // If no matches were found, return
                            if (data.items.length <= 0) {
                                $("#searchDialog").dialog("close");
                                return;
                            }

                            // Create new contact from first result
                            var newContact = {
                                contact: {href: data.items[0].resource.href},
                                standing: 0
                            };

                            // Add new contact to contact list
                            $.ajax(contactListUri, {
                                type: "POST",
                                contentType: "application/vnd.ccp.eve.ContactCreate-v1+json",
                                data: JSON.stringify(newContact),
                                success: function() {

                                    // Get new contact list from api
                                    ajaxGet(contactListUri, "vnd.ccp.eve.ContactCollection-v1", renderContactList);
                                }
                            });

                            // Close dialog
                            $("#searchDialog").dialog("close");
                        }
                    });
                }
            }
        });
    }

    // Request new contact list from api when paging links are clicked
    function onClickPage(evt) {
        evt.preventDefault();
        window.location.hash = $(evt.target).attr('href');
    }

    // Cache and render contact list data then bind handlers to rendered elements
    function renderContactList(list) {
        contactList = list;
        var templateData = $.extend({}, contactList, {href:contactListUri});
        $("#wrapper").contents().remove();
        $("#wrapper").append(contactListTemplate(templateData));
        $(".standing").change(onStandingChange);
        $(".remove").click(onClickRemove);
        $(".watched").click(onClickWatched);
        $(".page").click(onClickPage);
        $("#add").click(onClickAdd);
    }

    // Update contact in cache and via api
    function updateContact(evt, update) {
        var name = $(evt.target).siblings(".name").html();
        var contact = getContact(name);
        if (contact === false) {
            return false;
        }
        var oldValue = $.extend({}, contact);
        contact = $.extend(contact, update);
        $.ajax(contact.href, {
            type: "PUT",
            contentType: "application/vnd.ccp.eve.ContactCreate-v1+json",
            data: JSON.stringify(contact),
            error: function() {
                // Request failed, restore original value.
                contact = $.extend(contact, oldValue);
                renderContactList(contactList);
            }
        });
        return true;
    }

    function createRequestObject() {
        var result;
        if (window.XMLHttpRequest) {
            result = new XMLHttpRequest();
        } else {
            result = new ActiveXObject("Microsoft.XMLHTTP");
        }
        if (!result) {
            // TODO: error dialog...
        }
        return result;
    }

    function requestNotifications() {
        notificationRequest = createRequestObject();
        notificationRequest.open('get', notificationUri, true);
        notificationRequest.setRequestHeader("Authorization", "Bearer " + token);
        notificationRequest.setRequestHeader("Accept", "application/vnd.ccp.eve.OnContactUpdate-v1+json, application/vnd.ccp.eve.OnContactDelete-v1+json");
        notificationRequest.onreadystatechange = pollNotificationResponse;
        notificationRequest.send(null);
        notificationStartIndex = 0;
        notificationPollTimer = setInterval(pollNotificationResponse, 1000);
    }

    function pollNotificationResponse() {

        var i, line, lines;

        // return if status is not OK or response is not ready
        if (notificationRequest.readyState != 4 && notificationRequest.readyState != 3) {
            return;
        }
        if (notificationRequest.readyState == 3 && notificationRequest.status != 200) {
            return;
        }
        if (notificationRequest.readyState == 4 && notificationRequest.status != 200) {
            clearInterval(notificationPollTimer);
        }

        // split responses and display any newly received messages
        lines = notificationRequest.responseText.split("\n");
        for (i = notificationStartIndex; i < lines.length; i += 1) {

            line = $.trim(lines[i]);

            if (line === "") {
                continue;
            }

            // request new contact list on notification
            // an alternative approach would be to apply notification changes to cached local data, but this
            // is more complex and may result in inconsistencies
            ajaxGet(contactListUri, "vnd.ccp.eve.ContactCollection-v1", renderContactList);

            // skip this message next time response is polled.
            notificationStartIndex = i + 1;
        }

        // if responses is too long, reconnect to free response memory
        if (lines.length > 100) {

            clearInterval(notificationPollTimer);
            notificationRequest.abort();
            requestNotifications();
        }
    }

    // Follow contact list hyperlink in character
    function getContacts(character) {

        notificationUri = character.notifications.href;
        requestNotifications();

        window.location.hash = character.contacts.href;
    }

    // Follow authorized character hyperlink in api root
    function getCharacter(apiRoot) {
        // searchUri = apiRoot.search.href; TODO: restore this once we have a decent search implementation...
        ajaxGet(apiRoot.character.href, "vnd.ccp.eve.Character-v1", getContacts);
    }

    // Request api root
    function getRoot() {
        ajaxGet(server + "/", "vnd.ccp.eve.Api-v1", getCharacter);
    }

    // Load new API path when hash fragment changes.
    window.onhashchange = function() {
        contactListUri = window.location.hash.substring(1);
        ajaxGet(contactListUri, "vnd.ccp.eve.ContactCollection-v1", renderContactList);
    };

    // Generate an RFC4122 version 4 UUID
    function uuidGen() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    }

    // Extract value from oauth formatted hash fragment.
    function extractFromHash(name, hash) {
        var match = hash.match(new RegExp(name + "=([^&]+)"));
        return !!match && match[1];
    }

     // Request OAuth token or API root on load.
    $(document).ready(function() {

        var hash = document.location.hash;
        token = extractFromHash("access_token", hash);

        if (token) {

            // Check CSRF token in state matches token saved in cookie
            if(extractFromHash("state", hash) !== $.cookie(csrfTokenName)) {
                $("#errorDialog").contents().remove();
                $("#errorDialog").append("CSRF token mismatch");
                $("#errorDialog").dialog();
                return;
            }

            // Delete CSRF token cookie.
            $.cookie(csrfTokenName, null);

            // OAuth token received, set default AJAX headers and render API root
            $.ajaxSetup({
                accepts: "application/json, charset=utf-8",
                crossDomain: true,
                type: "GET",
                dataType: "json",
                headers: {
                    "Accept": "application/json, charset=utf-8",
                    "Authorization": "Bearer " + token
                }
            });

            // Set up default error handler
            $(document).ajaxError(function (event, xhr, settings) {
                $("#errorDialog").contents().remove();
                $("#errorDialog").append(errorTemplate({
                    status: xhr.status,
                    url: settings.url,
                    message: xhr.responseText
                }));
                $("#errorDialog").dialog({
                    minWidth:480
                });
            });

            // Load data
            getRoot();
        }
        else {

            // Store CSRF token as cookie
            var csrfToken = uuidGen();
            $.cookie(csrfTokenName, csrfToken);

            // No OAuth token, request one from the OAuth authentication endpoint
            window.location = authorizationEndpoint +
                "?response_type=token" +
                "&client_id=" + clientId +
                "&scope=" + scopes +
                "&redirect_uri=" + redirectUri +
                "&state=" + csrfToken;
        }
    });

}()); // End contactjs
