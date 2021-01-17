/* 01-egghead-angular-2-building-an-instant-search-with-angular-2-consuming-events-as-observables:
We want to consume events from our template as observables to build a rich UX.
When building such a thing, we face issues like sending too many reqs or getting responses out of order.

markup:
<input (input)="search($event.target.value)">

In order to do things such as debouncing or deduplicating, we have to find a way to consume the changes of the <input> box as an observable of string.
We can solve that using a subject.

A subject is an observable that we can subscribe to, but at the same time we can also emit notifications on it. We can see it as a proxy between
the actual event and then observable of that event. We need to create a property of type Subject of string.

Now that we have the subject, we need to make sure to subscribe to it to emit changes and invoke our search method there. We can do that either in
constructor or in the ngOnInit() . It's cleaner to do it in onInit hook.
So far, there's no one actually raising the notifications(calling next() method on that subject) on our subject. So let's change our template to not
directly invoke search() method, but call: term$.next() instead.
By doing that, we're kinda forwarding the (input) event into our subject. So in template:
<input (input)="term$.next($event.target.value)">

EX)
term$ = new Subject()<string>;

ngOnInit() {
    this.term$.subscribe(term => this.search(term));
}

search() {
    this.service.search(term).subscribe(results => this.items = results);
}

Our search still works the same way as before, but we're now proxying the user input through an observable which is exactly what we need to proceed.

02-egghead-angular-2-building-an-instant-search-with-angular2-debouncing-the-user-input:
Now that we consume the (input) event of our text box as observable(because we're saying: (input)="term$.next(...)"), we can apply a whole set of
operators on top of it, to create a more meaningful observable for our specific use case.
Currently, when we're looking at network tab of devtools, we're making req to api with every single keystroke. We want to make req, whenever user stops
typing for a brief moment. So we want to skip all the notifications(in this case notifications are (input) events) up to the point where there hasn't been
a new notification for at least, say 400ms and once we have that gap, the last notification come through. So we can use debounceTime().
EX) this.term$.pipe(debounceTime(400))
Now we don't perform request on every keystroke anymore. The req goes out as soon as I rest my finger for 400ms.

03-egghead-angular-2-building-an-instant-search-with-angular-2-preventing-unnecessary-requests:
Now that we debounce the user input, we're saving our api from TONs of unecasseary traffic. Currently, when we type: "Ang" and then rest our finger for at least
400ms, we see the req going out. Now let's see what happens when we hit backspace and immdediately(under 400ms) and then AGAIN write g, so still we write:
"Ang". What happens is that we make another request to that already made request that we made before. So since we're ALREADY displaying the search results
for EXACTLY that character sequence, we could actually save the request. So what we need, is an operator for filter out subsequent duplicate notifications.
So we need distinctUntilChanged operator. We can think of it, as a filter operator that works over an buffer of the last notifications to remove duplicates.
Place it right after debounceTime(). As soon as the term$ changes and 400ms pasts, it will make the request.

04-egghead-angular-2-building-an-instant-search-with-angular-2-combining-observables-with-flatmap:
Now we want to deal with out of order responses. But first, lets improve egonomics of our code.
Notice that we have one subscribe call after distinct and when it's called, it invokes the search() method and inside that method, we call the search() method of
service and subscribes to results of that method. Basically we have two subscribe calls in our code which are loosely connect, via method call.

Imagine we would map from the current search term to the service call which returns an observable of array of string. So we end up with an observable of
observable(??? or observer) of array of string! So when we subscribe to search() method of service, the payload would be the observable that our
service call returns. Which means we STILL have to subscribe to inner observable to get the actual array of strings that we're interested in. Then we should
remove the search() method from our component(NOT the search() method of service! We still need that), since we don't use it anymore because of using of map()
operator. So now we have:
this.term$.pipe(
  debounceTime(400),
  distinctUntilChanged(),
  map(term => {
     this.service.search(term);
  })
).subscribe(
  obsResults => obsResults.subscribe(
   results => this.items = results;
  )
);

Now we have 2 subscribe calls, because our payload(the result of map()) became an observable ITSELF. But luckily, we can use mergeMap which lets us to map to
another observable, but instead of our simple map() which turns into an observable into an observer of observable(???), flatMap() automatically subscribe to
those inner observables and flattens them into just one observable at the same time. flatMap() is alias to mergeMap() .
Now change map() to flatMap() and since flatMap() flattens for us behind the scenes, we don't have an observable of observable anymore, which means we can
change the callback of our subscribe, because now we receive the PLAIN array of terms, instead of an observable that we would have to MANUALLY subscribe to(which
happens when using map()).
EX) this.term$.pipe(
     debounceTime(400),
     distinctUntilChanged(),
     flatMap(term => {
     this.service.search(term);
  }).subscribe(results => this.items = results);

Now the code is cleaner.

05-egghead-angular-2-building-an-instant-search-with-angular-2-dealing-with-out-of-order-responses:
Everytime that we rest our fingers(for more than 400ms), a new req goes out. So it maybe totally possible that we have multiple reqs IN FLIGHT, waiting to get
back to us, with the response. So no one can guarantee that those responses come back in order. There might be load balancers involved that route reqs to different
servers and they may handle reqs at different performance. For example, the response for current sequence "An" is coming back SO late, that it overrides the
response for "Ang" which leaves our UI in a state where the response doesn't match the list of html.

So instead of flatMap() or mergeMap() , we should use switchMap() which is equavalant to flatMap() but with a tiny twist. Everytime we project the value into
an observable, we subscribe to that observable just as flatMap() would do. But we also automatically UNsubscribe from the PREVIOUS observable that we map to
before, in switchMap() .
So in code, replace flatmap() with switchMap() .
Now everytime a new req goes out, we unsubscribe from the previous one. So type: "an", then rest at least 400ms, then add "g" and we know the response for
"an" comes back, but our app doesn't care about it anymore(because a new value was projected).

06-egghead-angular-2-building-an-instant-search-with-angular-2-building-fully-reactive-apis:
We want an smarter search service that would handle all of those details(operators and ...) behind the scenes?
As component, we shouldn't have to worry about debouncing, de duplicating and dealing with out of order responses. Because observables are first-class objects,
we can put APIs that not only return observables, but also accept observables as args. So let's make the search() method of our service, smarter.
So in the method, instead of receiving a simple string which we named it terms, we receive an observable of string.
The second arg by default is 400, by the caller can override it, because we're just using a default value for second arg.
Now inside the method, we just paste all the operators that we were using inside our comp(and that was bad practice!) had with some tweaks.
EX) search(terms$: Observable<string>, debounceMs = 400) {
        return terms$.pipe(
                debounceTime(400),
                distinctUntilChanged(),
                switchMap(term => this.rawSearch(term);
}

In the comp, we can use the new method and we need to pass it an observable of string which would be that raw unprocessed observable from our text-box and
we expose the results of subscribe() to items prop of our comp.
EX)
term$ = new Subject<string>();
this.service.search(results => this.items = results)*/
