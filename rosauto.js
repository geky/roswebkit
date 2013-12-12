/**
 * ROSWebKit automatic attacher
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 */

var roswebkit = function(bridgeport, mjpegport) {
    var plots = [
        { name: 'rosplot', plot: ROSPlot, 
          params: ['lines','zero','miny','maxy','buffer'] },
        { name: 'rosplot2', plot: ROSPlot2,
          params: ['lines', 'zero', 'miny', 'maxy', 
                   'minx', 'maxx', 'buffer'] },
        { name: 'rosrange', plot: ROSRange,
          params: ['zero', 'fill', 'min', 'max', 'buffer'] },
        { name: 'rosrrange', plot: ROSRRange,
          params: ['fill', 'max', 'deg', 'buffer'] },
        { name: 'rosecho', plot: ROSEcho,
          params: [] },
        { name: 'roswatch', plot: ROSWatch,
          params: ['quality', 'invert'] },
    ]

    var requestFrame = ( window.requestAnimationFrame       ||
                         window.webkitRequestAnimationFrame ||
                         window.mozRequestAnimationFrame    ||
                         window.oRequestAnimationFrame      ||
                         window.msRequestAnimationFrame     ||
                         function(callback) { setInterval(callback, 100); } );

    var ros = new ROSManager(bridgeport, mjpegport)

    var elements = []

    for (var p = 0; p < plots.length; p++) {
        var elems = document.getElementsByClassName(plots[p].name)

        for (var e = 0; e < elems.length; e++) {
            var canvas = elems[e]
            var topics = canvas.getAttribute('topic').split(/\s*,\s*/)
            var ctx = canvas.getContext('2d')
            var plot = new plots[p].plot(ros, topics)

            ctx.width = canvas.width
            ctx.height = canvas.height
            canvas.style.setProperty('background-color', 'black')

            for (var a = 0; a < plots[p].params.length; a++) {
                var param = canvas.getAttribute(plots[p].params[a])

                if (param) {
                    plot[plots[p].params[a]] = eval(param)
                }
            }
            
            elements.push(function() {
                canvas.width = canvas.width
                plot.render(ctx)
            })
        }
    }

    var frame = function() {
        for (var i = 0; i < elements.length; i++) {
            elements[i]();
        }

        requestFrame(frame)
    }

    requestFrame(frame)
}
