import {
    IS_NODE,
    isNil,
    isNumber,
    isArrayHasData,
    getValueOrDefault
} from 'core/util';
import { hasFunctionDefinition } from 'core/mapbox';
import { splitTextToRow, getAlignPoint, replaceVariable } from 'core/util/strings';
import Point from 'geo/Point';
import PointExtent from 'geo/PointExtent';
import Canvas from 'core/Canvas';
import PointSymbolizer from './PointSymbolizer';

const CACHE_KEY = '___text_symbol_cache';

export default class TextMarkerSymbolizer extends PointSymbolizer {

    static test(symbol) {
        if (!symbol) {
            return false;
        }
        if (!isNil(symbol['textName'])) {
            return true;
        }
        return false;
    }

    constructor(symbol, geometry, painter) {
        super(symbol, geometry, painter);
        this._dynamic = hasFunctionDefinition(symbol);
        this.style = this._defineStyle(this.translate());
        this.strokeAndFill = this._defineStyle(this.translateLineAndFill(this.style));
        const textContent = replaceVariable(this.style['textName'], this.geometry.getProperties());
        if (!this._dynamic) {
            // the key to cache text descriptor
            this._cacheKey = genCacheKey(textContent, this.style);
        }
        this._descText(textContent);
    }

    symbolize(ctx, resources) {
        if (this.style['textSize'] === 0 || this.style['textOpacity'] === 0) {
            return;
        }
        const cookedPoints = this._getRenderContainerPoints();
        if (!isArrayHasData(cookedPoints)) {
            return;
        }
        const style = this.style,
            strokeAndFill = this.strokeAndFill;
        const textContent = replaceVariable(this.style['textName'], this.geometry.getProperties());
        this._descText(textContent);
        this._prepareContext(ctx);
        Canvas.prepareCanvas(ctx, strokeAndFill, resources);
        Canvas.prepareCanvasFont(ctx, style);
        for (let i = 0, len = cookedPoints.length; i < len; i++) {
            let p = cookedPoints[i];
            const origin = this._rotate(ctx, p, this._getRotationAt(i));
            if (origin) {
                p = origin;
            }
            Canvas.text(ctx, textContent, p, style, this.textDesc);
            if (origin) {
                ctx.restore();
            }
        }
    }

    getPlacement() {
        return this.symbol['textPlacement'];
    }

    getRotation() {
        const r = this.style['textRotation'];
        if (!isNumber(r)) {
            return null;
        }
        //to radian
        return r * Math.PI / 180;
    }

    getDxDy() {
        const s = this.style;
        const dx = s['textDx'],
            dy = s['textDy'];
        return new Point(dx, dy);
    }

    getMarkerExtent() {
        const dxdy = this.getDxDy(),
            style = this.style,
            size = this.textDesc['size'];
        const alignPoint = getAlignPoint(size, style['textHorizontalAlignment'], style['textVerticalAlignment']);
        const alignW = alignPoint.x,
            alignH = alignPoint.y;
        return new PointExtent(
            dxdy.add(alignW, alignH),
            dxdy.add(alignW + size['width'], alignH + size['height'])
        );
    }

    translate() {
        const s = this.symbol;
        const result = {
            'textName': s['textName'],
            'textFaceName': getValueOrDefault(s['textFaceName'], 'monospace'),
            'textWeight': getValueOrDefault(s['textWeight'], 'normal'), //'bold', 'bolder'
            'textStyle': getValueOrDefault(s['textStyle'], 'normal'), //'italic', 'oblique'
            'textSize': getValueOrDefault(s['textSize'], 10),
            'textFont': getValueOrDefault(s['textFont'], null),
            'textFill': getValueOrDefault(s['textFill'], '#000'),
            'textOpacity': getValueOrDefault(s['textOpacity'], 1),

            'textHaloFill': getValueOrDefault(s['textHaloFill'], '#ffffff'),
            'textHaloRadius': getValueOrDefault(s['textHaloRadius'], 0),
            'textHaloOpacity': getValueOrDefault(s['textHaloOpacity'], 1),

            'textWrapWidth': getValueOrDefault(s['textWrapWidth'], null),
            'textWrapBefore': getValueOrDefault(s['textWrapBefore'], false),
            'textWrapCharacter': getValueOrDefault(s['textWrapCharacter'], '\n'),
            'textLineSpacing': getValueOrDefault(s['textLineSpacing'], 0),

            'textDx': getValueOrDefault(s['textDx'], 0),
            'textDy': getValueOrDefault(s['textDy'], 0),

            'textHorizontalAlignment': getValueOrDefault(s['textHorizontalAlignment'], 'middle'), //left | middle | right | auto
            'textVerticalAlignment': getValueOrDefault(s['textVerticalAlignment'], 'middle'), // top | middle | bottom | auto
            'textAlign': getValueOrDefault(s['textAlign'], 'center') //left | right | center | auto
        };

        return result;
    }

    translateLineAndFill(s) {
        return {
            'lineColor': s['textHaloRadius'] ? s['textHaloFill'] : s['textFill'],
            'lineWidth': s['textHaloRadius'],
            'lineOpacity': s['textOpacity'],
            'lineDasharray': null,
            'lineCap': 'butt',
            'lineJoin': 'round',
            'polygonFill': s['textFill'],
            'polygonOpacity': s['textOpacity']
        };
    }

    _descText(textContent) {
        if (this._dynamic) {
            this.textDesc = splitTextToRow(textContent, this.style);
            return;
        }
        this.textDesc = this._loadFromCache();
        if (!this.textDesc) {
            this.textDesc = splitTextToRow(textContent, this.style);
            this._storeToCache(this.textDesc);
        }
    }

    _storeToCache(textDesc) {
        if (IS_NODE) {
            return;
        }
        if (!this.geometry[CACHE_KEY]) {
            this.geometry[CACHE_KEY] = {};
        }
        this.geometry[CACHE_KEY][this._cacheKey] = textDesc;
    }

    _loadFromCache() {
        if (!this.geometry[CACHE_KEY]) {
            return null;
        }
        return this.geometry[CACHE_KEY][this._cacheKey];
    }
}

function genCacheKey(textContent, style) {
    const key = [textContent];
    for (const p in style) {
        if (style.hasOwnProperty(p) && p.length > 4 && p.substring(0, 4) === 'text') {
            key.push(p + '=' + style[p]);
        }
    }
    return key.join('-');
}
