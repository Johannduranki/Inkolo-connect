import { Injectable } from '@angular/core';

export interface DailyScripture {
  day: number;
  text: string;
  reference: string;
}

@Injectable({ providedIn: 'root' })
export class DailyScriptureService {
  private readonly anchorDate = new Date(2026, 0, 1);
  private readonly cycleLength = 360;
  private readonly verses = [
    ['The Lord is my shepherd; I shall not want.', 'Psalm 23:1'],
    ['This is the day which the Lord hath made; we will rejoice and be glad in it.', 'Psalm 118:24'],
    ['Trust in the Lord with all thine heart; and lean not unto thine own understanding.', 'Proverbs 3:5'],
    ['In all thy ways acknowledge him, and he shall direct thy paths.', 'Proverbs 3:6'],
    ['The name of the Lord is a strong tower: the righteous runneth into it, and is safe.', 'Proverbs 18:10'],
    ['Be still, and know that I am God.', 'Psalm 46:10'],
    ['The Lord is my light and my salvation; whom shall I fear?', 'Psalm 27:1'],
    ['Create in me a clean heart, O God; and renew a right spirit within me.', 'Psalm 51:10'],
    ['Thy word is a lamp unto my feet, and a light unto my path.', 'Psalm 119:105'],
    ['I will praise thee; for I am fearfully and wonderfully made.', 'Psalm 139:14'],
    ['A soft answer turneth away wrath: but grievous words stir up anger.', 'Proverbs 15:1'],
    ['Commit thy works unto the Lord, and thy thoughts shall be established.', 'Proverbs 16:3'],
    ['The joy of the Lord is your strength.', 'Nehemiah 8:10'],
    ['They that wait upon the Lord shall renew their strength.', 'Isaiah 40:31'],
    ['Fear thou not; for I am with thee: be not dismayed; for I am thy God.', 'Isaiah 41:10'],
    ['I know the thoughts that I think toward you, saith the Lord, thoughts of peace.', 'Jeremiah 29:11'],
    ['Blessed are the pure in heart: for they shall see God.', 'Matthew 5:8'],
    ['Blessed are the peacemakers: for they shall be called the children of God.', 'Matthew 5:9'],
    ['Let your light so shine before men, that they may see your good works.', 'Matthew 5:16'],
    ['Ask, and it shall be given you; seek, and ye shall find.', 'Matthew 7:7'],
    ['With God all things are possible.', 'Matthew 19:26'],
    ['Thou shalt love thy neighbour as thyself.', 'Matthew 22:39'],
    ['For where two or three are gathered together in my name, there am I in the midst of them.', 'Matthew 18:20'],
    ['Peace I leave with you, my peace I give unto you.', 'John 14:27'],
    ['I am the way, the truth, and the life.', 'John 14:6'],
    ['Greater love hath no man than this, that a man lay down his life for his friends.', 'John 15:13'],
    ['We walk by faith, not by sight.', '2 Corinthians 5:7'],
    ['My grace is sufficient for thee: for my strength is made perfect in weakness.', '2 Corinthians 12:9'],
    ['I can do all things through Christ which strengtheneth me.', 'Philippians 4:13'],
    ['Be careful for nothing; but in every thing by prayer and supplication let your requests be made known unto God.', 'Philippians 4:6'],
    ['The peace of God, which passeth all understanding, shall keep your hearts and minds.', 'Philippians 4:7'],
    ['Set your affection on things above, not on things on the earth.', 'Colossians 3:2'],
    ['Whatsoever ye do, do it heartily, as to the Lord.', 'Colossians 3:23'],
    ['Pray without ceasing.', '1 Thessalonians 5:17'],
    ['In every thing give thanks: for this is the will of God.', '1 Thessalonians 5:18'],
    ['God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.', '2 Timothy 1:7'],
    ['Faith is the substance of things hoped for, the evidence of things not seen.', 'Hebrews 11:1'],
    ['Let us consider one another to provoke unto love and to good works.', 'Hebrews 10:24'],
    ['Every good gift and every perfect gift is from above.', 'James 1:17'],
    ['Be ye doers of the word, and not hearers only.', 'James 1:22'],
    ['Draw nigh to God, and he will draw nigh to you.', 'James 4:8'],
    ['Casting all your care upon him; for he careth for you.', '1 Peter 5:7'],
    ['Above all things have fervent charity among yourselves.', '1 Peter 4:8'],
    ['We love him, because he first loved us.', '1 John 4:19'],
    ['Perfect love casteth out fear.', '1 John 4:18'],
    ['God is love; and he that dwelleth in love dwelleth in God.', '1 John 4:16'],
    ['Let us not love in word, neither in tongue; but in deed and in truth.', '1 John 3:18'],
    ['O give thanks unto the Lord; for he is good: for his mercy endureth for ever.', 'Psalm 107:1'],
    ['Delight thyself also in the Lord; and he shall give thee the desires of thine heart.', 'Psalm 37:4'],
    ['The Lord is nigh unto all them that call upon him.', 'Psalm 145:18'],
    ['Weeping may endure for a night, but joy cometh in the morning.', 'Psalm 30:5'],
    ['Cast thy burden upon the Lord, and he shall sustain thee.', 'Psalm 55:22'],
    ['The Lord shall preserve thy going out and thy coming in.', 'Psalm 121:8'],
    ['Let every thing that hath breath praise the Lord.', 'Psalm 150:6'],
    ['A friend loveth at all times.', 'Proverbs 17:17'],
    ['Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.', 'Proverbs 27:17'],
    ['The Lord bless thee, and keep thee.', 'Numbers 6:24'],
    ['The Lord make his face shine upon thee, and be gracious unto thee.', 'Numbers 6:25'],
    ['The Lord lift up his countenance upon thee, and give thee peace.', 'Numbers 6:26'],
    ['The grace of our Lord Jesus Christ be with you all.', 'Revelation 22:21']
  ] as const;

  getToday(date = new Date()): DailyScripture {
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const elapsed = Math.floor(
      (today.getTime() - this.anchorDate.getTime()) / 86_400_000
    );
    const dayIndex = ((elapsed % this.cycleLength) + this.cycleLength) % this.cycleLength;
    const verse = this.verses[dayIndex % this.verses.length];
    return { day: dayIndex + 1, text: verse[0], reference: verse[1] };
  }
}
