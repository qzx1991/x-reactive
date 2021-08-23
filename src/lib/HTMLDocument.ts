import { IDocument, IDomElement, IDomPosition } from './types';

const LazyHTMLDocument: IDocument = {
    createTextElement(v: string) {
        return new MyBaseElement(new Text(v));
    },
    isTextElement(v: any) {
        return v instanceof MyBaseElement && v.isText();
    },
    createElement(dom: string) {
        return new MyBaseElement(document.createElement(dom));
    },
    querySelect(v: string) {
        const r = document.querySelector(v);
        if (r) return new MyBaseElement(r as any);
        return null;
    },
    querySelectAll(v: string) {
        const rs = document.querySelectorAll(v);
        if (rs) return Array.from(rs).map((r) => new MyBaseElement(r as any));
        return null;
    },
    insertBefore(doms: IDomElement[], target: IDomElement) {
        if (!(target instanceof MyBaseElement))
            throw new Error('target to insert must be MyBaseElement Type');
        doms.forEach((dom) => {
            if (dom instanceof MyBaseElement) {
                dom.insertBefore(target);
            }
        });
    },
    requestAnimationFrame(h) {
        return requestAnimationFrame(h);
    },
};

export default LazyHTMLDocument;

class MyBaseElement implements IDomElement {
    isText() {
        return this.dom instanceof Text;
    }
    getText() {
        return this.isText()
            ? (this.dom as Text).textContent
            : (this.dom as any)?.innerText;
    }
    setText(text: string) {
        if (this.isText()) {
            (this.dom as Text).textContent = text;
        }
    }
    constructor(private dom: Text | HTMLElement) {}
    append(eles: IDomElement[] | IDomElement) {
        if (Array.isArray(eles)) {
            eles.forEach((ele) => this.append(ele));
        } else {
            if (eles instanceof MyBaseElement) {
                this.dom.appendChild(eles.dom);
            }
        }
    }
    get nextSibling(): IDomElement | undefined {
        const sib = this.dom.nextSibling || this.dom.nextElementSibling;
        if (!sib) return undefined;
        return new MyBaseElement(sib as any);
    }
    get preSibling(): IDomElement | undefined {
        const sib = this.dom.previousSibling || this.dom.previousElementSibling;
        if (!sib) return undefined;
        return new MyBaseElement(sib as any);
    }
    get parent(): IDomElement | undefined {
        const parent = this.dom.parentElement || this.dom.parentNode;
        if (!parent) return undefined;
        return new MyBaseElement(parent as any);
    }
    insertInto(position: IDomPosition) {
        if (position.nextSibling) {
            this.insertBefore(position.nextSibling);
        } else if (position.parent) {
            position.parent.append(this);
        }
    }
    insertBefore(target: IDomElement) {
        (target.parent as MyBaseElement).dom.insertBefore(
            this.dom,
            (target as MyBaseElement).dom
        );
    }
    setAttribute(attr: string, value: any) {
        if (attr === 'key') return;
        if ((this.dom as any)?.setAttribute) {
            // 处理事件
            if (/^on\w+/gi.test(attr)) {
                const eventname = attr.toLowerCase().replace(/^on/gi, '');
                this.dom.addEventListener(eventname, value);
                return;
            }
            switch (attr) {
                case 'className':
                    break;
                case 'style':
                    break;
                default:
                    (this.dom as HTMLElement).setAttribute(attr, value);
            }
        }
    }
    removeAttribute(attr: string, value?: any) {
        if (/^on\w+/gi.test(attr)) {
            const eventname = attr.toLowerCase().replace(/^on/gi, '');
            this.dom.removeEventListener(eventname, value);
            return;
        }
        if ((this.dom as any)?.removeAttribute) {
            switch (attr) {
                case 'className':
                    (this.dom as HTMLElement).removeAttribute('class');
                    break;
                default:
                    (this.dom as HTMLElement).removeAttribute(attr);
            }
        }
    }
    remove() {
        return this.dom.remove();
    }
    // 清空子节点
    clear() {
        if (this.dom instanceof Text) {
            this.dom.textContent = '';
        } else {
            this.dom.innerHTML = '';
        }
    }
}
