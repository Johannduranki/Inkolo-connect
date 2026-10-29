import {Component,Input,Pipe,PipeTransform,ChangeDetectorRef,OnDestroy,inject} from '@angular/core';
import {currentLanguage,translate,onLanguageChange,chooseLanguage,languageSession} from '../../public/language.js';
import {AuthService} from './auth.service';
import {environment} from '../environments/environment';
@Pipe({name:'translate',standalone:true,pure:false})
export class TranslatePipe implements PipeTransform {transform(value: string|null|undefined): string {return translate(value??'');}}
@Component({
 selector:'app-language-selector',standalone:true,
 template:`
   @if (compact) {
     <fieldset class="language-switch" [disabled]="busy">
       <legend>Language / Ulimi</legend>
       <div class="language-options">
         <label class="language-option">
           <input type="radio" name="login-language" value="en" [checked]="language() === 'en'" (change)="change('en')">
           <span lang="en">English</span>
         </label>
         <label class="language-option">
           <input type="radio" name="login-language" value="zu" [checked]="language() === 'zu'" (change)="change('zu')">
           <span lang="zu">isiZulu</span>
         </label>
       </div>
     </fieldset>
   } @else {
     <label>Language / Ulimi <select aria-label="Language / Ulimi" [value]="language()" [disabled]="busy" (change)="change($any($event.target).value)"><option value="en">English</option><option value="zu">isiZulu</option></select></label>
   }
   <span class="language-status" role="status">{{message}}</span>`,
 styles:[`
   :host{display:block;padding:8px 0}
   label{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:16px}
   select{font:inherit;padding:8px 12px;border:1px solid #aac4d3;border-radius:6px;background:white;color:#173e57;min-height:44px}
   .language-status{display:block;font-size:14px;color:#9c3020;max-width:360px}
   .language-status:empty{display:none}
   .language-switch{border:0;padding:0;margin:0;min-width:0}
   .language-switch legend{padding:0;margin:0 0 8px;color:#52697c;font-size:13px;font-weight:600;line-height:1.4;letter-spacing:0}
   .language-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;border:1px solid #cfdfec;border-radius:8px;background:#f0f6fb}
   .language-option{position:relative;display:block;margin:0;cursor:pointer}
   .language-option input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
   .language-option span{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;padding:8px 16px;border-radius:5px;font:600 15px/1.4 "Segoe UI",sans-serif;color:#405c73;transition:background 150ms,color 150ms,box-shadow 150ms}
   .language-option input:checked + span{background:#fff;color:#075b9d;box-shadow:0 1px 4px #12365224}
   .language-option:hover span{background:#e1edf7}
   .language-option input:checked + span{box-shadow:inset 0 -2px #0782ce,0 1px 4px #12365224}
   .language-option input:focus-visible + span{outline:2px solid #087bbd;outline-offset:2px}
   .language-switch:disabled{opacity:.6}
   .language-switch:disabled .language-option{cursor:wait}
   @media(prefers-reduced-motion:reduce){.language-option span{transition:none}}
 `]
})
export class LanguageComponent implements OnDestroy{
 @Input() compact=false;
 readonly language=currentLanguage;busy=false;message='';private readonly changeDetector=inject(ChangeDetectorRef);
 private readonly unsubscribe=onLanguageChange(()=>this.changeDetector.markForCheck());
 private readonly saveError=()=>{this.message=translate('Language preference could not be saved. Please try again.');this.changeDetector.markForCheck();};
 constructor(){window.addEventListener('duranki-language-save-error',this.saveError);void languageSession(inject(AuthService).getToken(),environment.apiUrl+'/preferences/language').catch(this.saveError);}
 async change(value:string){this.busy=true;this.message='';try{await chooseLanguage(value);}catch{this.message=translate('Language preference could not be saved. Please try again.');}finally{this.busy=false;this.changeDetector.markForCheck();}}
 ngOnDestroy(){this.unsubscribe();window.removeEventListener('duranki-language-save-error',this.saveError);}
}
