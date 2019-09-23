
const URL = require('url');
var version = require('../package.json').version;
const ignoreTheseAttributes = require('./ignore-attributes.js').ignoreTheseAttributes;

var receiver_makerapi = {
    start: function(platform) {
        const WebSocket = require('ws');
        var that = this;
        function connect(platform) {
            var parsed = URL.parse(platform.app_url)
            var url = '';
            if (parsed.port!==null && parsed.port !== undefined)
                url = `ws://${parsed.hostname}:${parsed.port}/eventsocket`;
            else
                url = `ws://${parsed.hostname}/eventsocket`;
            var ws = new WebSocket(url);
            platform.log('attempt connection to ' + url);

            var wsPingTimeout;
            function pinger() {
                if (ws.readyState != WebSocket.OPEN) return
                platform.log('HE websocket sending keepalive ping');
                ws.ping()
                setTimeout(pinger, 60 * 1000);
                wsPingTimeout = setTimeout(function() {
                    platform.log('HE websocket ping timeout, closing socket');
                    ws.close();
                }, 10 * 1000);
            }

            ws.addEventListener('pong', function(data) {
                platform.log('HE got pong ' + data);
                if (wsPingTimeout) clearTimeout(wsPingTimeout);
            });

            ws.addEventListener('ping', function(data) {
                platform.log('HE websocket received ping from hubitat  ' + data);
                ws.pong(data);
            });

            ws.onopen = function() {
                platform.log('connection to ' + url + ' established');
                pinger()
            };
        
            ws.onmessage = function(e) {
                try {
                    var jsonData = JSON.parse(e.data);
                } catch (e) {
                    platform.log.warn('Invalid JSON data received from websocket', e.data);
                    return;
                }
                var newChange = [];
                if (jsonData['source'] === 'DEVICE')
                {
                    if (platform.isAttributeUsed(jsonData['name'], jsonData['deviceId']))
                        newChange.push( { 
                            device: jsonData['deviceId'], 
                            attribute: jsonData['name'], 
                            value: jsonData['value'], 
                            date: new Date() , 
                            displayName: jsonData['displayName'] 
                        });
                } 
                else if (jsonData['source'] === 'LOCATION')
                {
                    switch (jsonData['name'])
                    {
                        case 'hsmStatus':
                            newChange.push( {
                                device: 'hsm' + platform.config['name'],
                                displayName: 'Alarm System ' + platform.config['name'],
                                attribute:  'alarmSystemStatus',
                                value: jsonData['value'],
                                date:  new Date()
                            });
                            newChange.push( {
                                device: 'hsm' + platform.config['name'],
                                displayName: 'Alarm System ' + platform.config['name'],
                                attribute:  'alarmSystemCurrent',
                                value: jsonData['value'],
                                date:  new Date()
                            });
                            break;
                        case 'hsmAlert':
                            if (jsonData['value'] === 'cancel')
                            {
                                platform.log('Received HSM Cancel');
                                newChange.push( {
                                    device: 'hsm' + platform.config['name'],
                                    displayName: 'Alarm System ' + platform.config['name'],
                                    device:  'hsm' + platform.config['name'],
                                    attribute:  'alarmSystemCurrent',
                                    value: platform.getAttributeValue('alarmSystemStatus', 'hsm' + platform.config['name'], platform),
                                    date:  new Date()
                                });
                            }
                            else
                            {
                                platform.log('Received HSM Alert');
                                newChange.push( {
                                    device: 'hsm' + platform.config['name'],
                                    displayName: 'Alarm System ' + platform.config['name'],
                                    device:  'hsm' + platform.config['name'],
                                    attribute:  'alarmSystemCurrent',
                                    value: 'alarm_active',
                                    date:  new Date()
                                });
                            }
                            break;
                        case 'mode':
                            for (var key in platform.deviceLookup) {
                                var accessory = platform.deviceLookup[key];
                                if (accessory.deviceGroup === "mode")
                                {
                                    if (accessory.name === "Mode - " + jsonData['value'])
                                        newChange.push( { device: accessory.deviceid, attribute: 'switch', value: 'on', date: new Date(), displayName: accessory.name });
                                    else
                                        newChange.push( { device: accessory.deviceid, attribute: 'switch', value: 'off', date: new Date(), displayName: accessory.name });
                                }
                            }
                            break;
                    }
                }
                newChange.forEach(function(element)
                {
                    platform.log('Change Event (Socket):', '(' + element['displayName'] + ':' + element['device'] + ') [' + (element['attribute'] ? element['attribute'].toUpperCase() : 'unknown') + '] is ' + element['value']);
                    platform.processFieldUpdate(element, platform);
                });
            };

            ws.onclose = function(e) {
              platform.log('HE Eventsocket is closed. Reconnect will be attempted in 1 second. ', e.reason);
              setTimeout(function() {
                connect(platform);
              }, 1000);
            };

            ws.onerror = function(err) {
              platform.log('HE Eventsocket encountered error: ', err.message, 'Closing socket');
              ws.close();
            };

        }
        connect(platform); 
    }
}


module.exports = {
        receiver: receiver_makerapi
    }


