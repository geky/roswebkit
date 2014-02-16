/**
 * ROSWebKit automatic attacher
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 */

var roswebkit = (function() {
    var plots = [
        { name: 'rosplot', 
          plot: ROSPlot, 
          params: ['lines','zero','miny','maxy','buffer']
        },
        { name: 'rosplot2', 
          plot: ROSPlot2,
          params: ['lines', 'zero', 'miny', 'maxy', 
                   'minx', 'maxx', 'buffer']
        },
        { name: 'rosrange', 
          plot: ROSRange,
          params: ['zero', 'fill', 'invert', 'min', 'max', 'buffer']
        },
        { name: 'rosrrange', 
          plot: ROSRRange,
          params: ['fill', 'invert', 'max', 'deg', 'buffer']
        },
        { name: 'rosecho', 
          plot: ROSEcho,
          params: []
        },
        { name: 'roswatch', 
          plot: ROSWatch,
          params: ['quality', 'invert']
        },
        { name: 'rosmap',
          plot: ROSMap,
          params: ['lines', 'zoom', 'type', 'buffer']
        }
    ]

    var requestFrame = (
        window.requestAnimationFrame       ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        function(callback) { setInterval(callback, 100); } 
    );


    function flatten() {
        for (var p = 0; p < plots.length; p++) {
            while (true) {
                var elem = document.getElementsByTagName(plots[p].name)[0]

                if (!elem)
                    break

                var parent = elem.parentElement
                var attr = elem.attributes
                var canvas = document.createElement('canvas')

                for (var a = 0; a < attr.length; a++) {
                    canvas.setAttribute(attr[a].name, attr[a].value)
                }

                canvas.innerHTML = elem.innerHTML
                canvas.classList.add(plots[p].name)

                parent.replaceChild(canvas, elem)
            }
        }
    }

    function addelement(ros, elem, plot) {
        var topics = elem.getAttribute('topic').split(/\s*,\s*/)
        var res = new plot.plot(ros, topics)

        elem.style.setProperty('background-color', 'black')

        for (var a = 0; a < plot.params.length; a++) {
            var param = elem.getAttribute(plot.params[a])

            if (param)
                res[plot.params[a]] = eval(param)
        }
        
        return function() {
            elem.width = elem.width

            var ctx = elem.getContext('2d')
            ctx.width = elem.width
            ctx.height = elem.height

            res.render(ctx)
        }
    }

    function roswebkit(bridgeport, mjpegport) {
        var ros = new ROSManager(bridgeport, mjpegport)
        var elements = []

        flatten()

        for (var p = 0; p < plots.length; p++) {
            var elems = document.getElementsByClassName(plots[p].name)

            for (var e = 0; e < elems.length; e++) {
                elements.push(addelement(ros, elems[e], plots[p]))
            }
        }

        function frame() {
            for (var i = 0; i < elements.length; i++) {
                elements[i]()
            }

            requestFrame(frame)
        }

        frame()
    }

    return roswebkit
})();

