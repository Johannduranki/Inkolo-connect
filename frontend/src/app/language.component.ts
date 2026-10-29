import {Component,Pipe,PipeTransform,ChangeDetectorRef,OnDestroy,inject} from '@angular/core';
import {currentLanguage,translate,onLanguageChange,chooseLanguage,languageSession} from '../../public/language.js';
import {AuthService} from './auth.service';
import {environment} from '../environments/environment';
@Pipe({name:'translate',standalone:true,pure:false})
export class TranslatePipe implements PipeTransform {transform(value: string|null|undefined): string {return translate(value??'');}}
@Component({selector:'app-language-selector',standalone:true,template:`<label>Language / Ulimi <select aria-label="Language / Ulimi" [value]="language()" [disabled]="busy" (change)="change($any($event.target).value)"><option value="en">English</option><option value="zu">isiZulu</option></select></label><span role="status">{{message}}</span>`,styles:[`:host{display:block;padding:8px 0}label{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:16px}select{font:inherit;padding:8px 12px;border:1px solid #aac4d3;border-radius:6px;background:white;color:#173e57;min-height:44px}span{display:block;font-size:14px;color:#9c3020;max-width:360px}`]})
export class LanguageComponent implements OnDestroy{
 readonly language=currentLanguage;busy=false;message='';private readonly changeDetector=inject(ChangeDetectorRef);
 private readonly unsubscribe=onLanguageChange(()=>this.changeDetector.markForCheck());
 private readonly saveError=()=>{this.message=translate('Language preference could not be saved. Please try again.');this.changeDetector.markForCheck();};
 constructor(){window.addEventListener('duranki-language-save-error',this.saveError);void languageSession(inject(AuthService).getToken(),environment.apiUrl+'/preferences/language').catch(this.saveError);}
 async change(value:string){this.busy=true;this.message='';try{await chooseLanguage(value);}catch{this.message=translate('Language preference could not be saved. Please try again.');}finally{this.busy=false;this.changeDetector.markForCheck();}}
 ngOnDestroy(){this.unsubscribe();window.removeEventListener('duranki-language-save-error',this.saveError);}
}
