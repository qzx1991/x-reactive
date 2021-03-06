import { IDocument, IDomElement, IDomPosition } from './types';

class DocumentStruct implements IDocument {
    isTextElement(d: any) {
        return undefined as any;
    }
    createTextElement(t: string) {
        return undefined as any;
    }
    createElement(t: string) {
        return undefined as any;
    }
    querySelect(k: string) {
        return null;
    }
    querySelectAll() {
        return null;
    }
    insertBefore(doms: IDomElement[], target: IDomElement) {
        return null;
    }
    requestAnimationFrame(h: () => void) {}
}

const LazyDocument = new DocumentStruct();
export default LazyDocument;
