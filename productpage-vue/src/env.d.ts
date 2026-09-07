/// <reference types="vite/client" />
// vue-i18n augments Vue's component types with $t. That augmentation only loads
// if a type-checked file pulls vue-i18n in, and main.js is .js so it sits
// outside tsconfig's include - without this reference every $t in a template
// errors with "Property '$t' does not exist".
/// <reference types="vue-i18n" />

declare module '*.vue' {
    import { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}