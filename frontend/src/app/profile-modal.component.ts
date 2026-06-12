import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ProfileService } from './profile.service';
import { MyDocumentsComponent } from './features/member/my-documents/my-documents.component';
import { MemberCommunity } from './core/models/member-community.model';
import { MemberCommunityService } from './core/services/member-community.service';

@Component({
  selector: 'app-profile-modal',
  standalone: true,
  imports: [ReactiveFormsModule, MyDocumentsComponent],
  templateUrl: './profile-modal.component.html',
  styleUrl: './profile-modal.component.css'
})
export class ProfileModalComponent implements OnInit {
  private readonly profiles = inject(ProfileService);
  private readonly communities = inject(MemberCommunityService);
  @Input({ required: true }) memberId!: number;
  @Output() readonly closed = new EventEmitter<void>();
  readonly activeTab = signal<'details' | 'documents'>('details');
  readonly memberCommunity = signal<MemberCommunity | null>(null);

  private readonly current = this.profiles.profile();
  readonly idNumber = new FormControl(this.current.idNumber, { nonNullable: true });
  readonly telephoneNumber = new FormControl(this.current.telephoneNumber, { nonNullable: true });
  readonly email = new FormControl(this.current.email, { nonNullable: true });
  readonly address = new FormControl(this.current.address, { nonNullable: true });
  readonly city = new FormControl(this.current.city, { nonNullable: true });
  readonly postalCode = new FormControl(this.current.postalCode, { nonNullable: true });
  readonly emergencyContactName = new FormControl(this.current.emergencyContactName, { nonNullable: true });
  readonly emergencyContactNumber = new FormControl(this.current.emergencyContactNumber, { nonNullable: true });

  ngOnInit(): void {
    this.communities.getMemberCommunity(String(this.memberId)).subscribe((community) =>
      this.memberCommunity.set(community)
    );
    this.profiles.load().subscribe(() => this.populateControls());
  }

  communityHeading(): string {
    return this.communities.getCommunityHeading(this.memberCommunity());
  }

  save(): void {
    this.profiles.save({
      idNumber: this.idNumber.value.trim(),
      telephoneNumber: this.telephoneNumber.value.trim(),
      email: this.email.value.trim(),
      address: this.address.value.trim(),
      city: this.city.value.trim(),
      postalCode: this.postalCode.value.trim(),
      emergencyContactName: this.emergencyContactName.value.trim(),
      emergencyContactNumber: this.emergencyContactNumber.value.trim()
    });
    this.closed.emit();
  }

  private populateControls(): void {
    const current = this.profiles.profile();
    this.idNumber.setValue(current.idNumber);
    this.telephoneNumber.setValue(current.telephoneNumber);
    this.email.setValue(current.email);
    this.address.setValue(current.address);
    this.city.setValue(current.city);
    this.postalCode.setValue(current.postalCode);
    this.emergencyContactName.setValue(current.emergencyContactName);
    this.emergencyContactNumber.setValue(current.emergencyContactNumber);
  }
}
